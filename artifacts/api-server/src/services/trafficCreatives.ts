import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  resourceRequestsTable,
  trafficCreativesTable,
  trafficCreativeUploadsTable,
  type InsertTrafficCreative,
  type TrafficCreative,
  type TrafficCreativePreparation,
  type TrafficCreativeMediaType,
} from "@workspace/db";
import {
  prepareTrafficCreativeDescription,
  trafficCreativeSourceHash,
} from "../lib/trafficCreativePreparation.js";
export { prepareTrafficCreativeDescription } from "../lib/trafficCreativePreparation.js";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "anuncio";
}

function mediaTypeFor(mime: string): TrafficCreativeMediaType {
  return mime.startsWith("video/") ? "video" : "image";
}

function assertObjectOwnership(objectPath: string, businessSlug: string): void {
  const expected = `/objects/traffic-creatives/${businessSlug}/`;
  if (!objectPath.startsWith(expected) || objectPath.slice(expected.length).includes("/")) {
    throw new Error("O ficheiro não pertence a este negócio");
  }
}

export function validateTrafficCreativeMedia(objectPath: string, mime: string, businessSlug: string): TrafficCreativeMediaType {
  if (!ALLOWED_MIME.has(mime)) throw new Error("Formato de ficheiro não suportado");
  assertObjectOwnership(objectPath, businessSlug);
  return mediaTypeFor(mime);
}

async function ensurePreparationResourceRequests(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: number,
  creativeId: string,
  preparation: TrafficCreativePreparation,
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`traffic-preparation:${businessId}:${creativeId}`}, 0))`);
  const source = `traffic_creative:${creativeId}`;
  const wantedPurposes = new Set(preparation.missingResources.map((missing) =>
    `traffic_creative:${creativeId}:${missing.purpose}`
  ));
  const openRequests = await tx.select({
    id: resourceRequestsTable.id,
    purpose: resourceRequestsTable.purpose,
  }).from(resourceRequestsTable).where(and(
    eq(resourceRequestsTable.businessId, businessId),
    eq(resourceRequestsTable.source, source),
    eq(resourceRequestsTable.status, "open"),
  ));
  for (const request of openRequests) {
    if (!wantedPurposes.has(request.purpose)) {
      await tx.update(resourceRequestsTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
        eq(resourceRequestsTable.id, request.id),
        eq(resourceRequestsTable.businessId, businessId),
        eq(resourceRequestsTable.status, "open"),
      ));
    }
  }
  for (const missing of preparation.missingResources) {
    const purpose = `traffic_creative:${creativeId}:${missing.purpose}`;
    const existing = await tx.select({
      id: resourceRequestsTable.id,
    }).from(resourceRequestsTable).where(and(
      eq(resourceRequestsTable.businessId, businessId),
      eq(resourceRequestsTable.source, source),
      eq(resourceRequestsTable.purpose, purpose),
      sql`${resourceRequestsTable.status} IN ('open', 'fulfilled')`,
    )).limit(1);
    if (!existing[0]) {
      await tx.insert(resourceRequestsTable).values({
        businessId,
        kind: missing.kind,
        purpose,
        request: missing.request,
        source,
      });
    }
  }
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let suffix = 2;
  while ((await db.select({ id: trafficCreativesTable.id }).from(trafficCreativesTable).where(eq(trafficCreativesTable.publicSlug, slug)).limit(1)).length) {
    slug = `${slugify(base)}-${suffix++}`;
  }
  return slug;
}

export async function listTrafficCreatives(businessId: number): Promise<TrafficCreative[]> {
  const rows = await db.select().from(trafficCreativesTable)
    .where(eq(trafficCreativesTable.businessId, businessId))
    .orderBy(desc(trafficCreativesTable.createdAt));
  const prepared: TrafficCreative[] = [];
  for (const row of rows) {
    prepared.push(row.preparation
      ? row
      : (await updateTrafficCreative(row.id, { description: row.description }, businessId)) ?? row);
  }
  return prepared;
}

export async function createTrafficCreative(
  input: { description: string; objectPath: string; mediaMimeType: string },
  businessId: number,
  businessSlug: string,
): Promise<TrafficCreative> {
  const mediaType = validateTrafficCreativeMedia(input.objectPath, input.mediaMimeType, businessSlug);
  const publicSlug = await uniqueSlug(input.description.slice(0, 60));
  const preparation = prepareTrafficCreativeDescription(input.description, mediaType, 1);
  const values: InsertTrafficCreative = {
    businessId,
    description: input.description,
    objectPath: input.objectPath,
    mediaMimeType: input.mediaMimeType,
    mediaType,
    publicSlug,
    preparation,
    preparationVersion: preparation.version,
    preparationSourceHash: preparation.sourceHash,
    preparedAt: new Date(),
  };
  return db.transaction(async (tx) => {
    const rows = await tx.insert(trafficCreativesTable).values(values).returning();
    const creative = rows[0]!;
    const confirmed = await tx.update(trafficCreativeUploadsTable)
      .set({
        status: "confirmed",
        creativeId: creative.id,
        confirmedAt: new Date(),
        cleanupClaimedAt: null,
        lastCleanupError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(trafficCreativeUploadsTable.businessId, businessId),
        eq(trafficCreativeUploadsTable.businessSlug, businessSlug),
        eq(trafficCreativeUploadsTable.objectPath, input.objectPath),
        eq(trafficCreativeUploadsTable.mediaMimeType, input.mediaMimeType),
        eq(trafficCreativeUploadsTable.status, "pending"),
        gt(trafficCreativeUploadsTable.expiresAt, new Date()),
      ))
      .returning({ id: trafficCreativeUploadsTable.id });
    if (!confirmed[0]) {
      throw new Error("O upload expirou, já foi utilizado ou não pertence a este negócio");
    }
    await ensurePreparationResourceRequests(tx, businessId, creative.id, preparation);
    return creative;
  });
}

export async function updateTrafficCreative(
  id: string,
  patch: { description?: string; active?: boolean },
  businessId: number,
): Promise<TrafficCreative | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`traffic-creative:${businessId}:${id}`}, 0))`);
    const current = (await tx.select().from(trafficCreativesTable).where(and(
      eq(trafficCreativesTable.id, id),
      eq(trafficCreativesTable.businessId, businessId),
    )).limit(1))[0];
    if (!current) return null;
    const description = patch.description ?? current.description;
    const nextHash = trafficCreativeSourceHash(description, current.mediaType);
    const changed = current.preparationSourceHash !== nextHash || !current.preparation;
    const preparation = changed
      ? prepareTrafficCreativeDescription(description, current.mediaType, current.preparationVersion + 1)
      : current.preparation;
    const rows = await tx.update(trafficCreativesTable)
      .set({
        ...(patch.description !== undefined ? { description } : {}),
        ...(patch.active !== undefined ? { active: patch.active ? 1 : 0 } : {}),
        ...(changed ? {
          preparation: preparation!,
          preparationVersion: preparation!.version,
          preparationSourceHash: preparation!.sourceHash,
          preparedAt: new Date(),
        } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(trafficCreativesTable.id, id), eq(trafficCreativesTable.businessId, businessId)))
      .returning();
    if (changed) await ensurePreparationResourceRequests(tx, businessId, id, preparation!);
    return rows[0] ?? null;
  });
}

export interface PublicTrafficCreative {
  id: string;
  slug: string;
  description: string;
  mediaType: TrafficCreativeMediaType;
  mediaMimeType: string;
  mediaUrl: string;
  visitCount: number;
}

function safeCreative(row: TrafficCreative): PublicTrafficCreative {
  return {
    id: row.id,
    slug: row.publicSlug,
    description: row.description,
    mediaType: row.mediaType,
    mediaMimeType: row.mediaMimeType,
    mediaUrl: `/api/storage${row.objectPath}`,
    visitCount: row.visitCount,
  };
}

export async function resolvePublicTrafficCreative(
  businessId: number,
  slug: string,
): Promise<PublicTrafficCreative | null> {
  const rows = await db.select().from(trafficCreativesTable)
    .where(and(eq(trafficCreativesTable.businessId, businessId), eq(trafficCreativesTable.publicSlug, slug), eq(trafficCreativesTable.active, 1)))
    .limit(1);
  const creative = rows[0];
  if (!creative) return null;
  const updated = await db.update(trafficCreativesTable)
    .set({ visitCount: sql`${trafficCreativesTable.visitCount} + 1` })
    .where(and(eq(trafficCreativesTable.id, creative.id), eq(trafficCreativesTable.active, 1)))
    .returning();
  return safeCreative(updated[0] ?? creative);
}

export async function getTrafficCreativeBySlug(businessId: number, slug: string): Promise<TrafficCreative | null> {
  const rows = await db.select().from(trafficCreativesTable)
    .where(and(eq(trafficCreativesTable.businessId, businessId), eq(trafficCreativesTable.publicSlug, slug)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.preparation
    ? row
    : (await updateTrafficCreative(row.id, { description: row.description }, businessId)) ?? row;
}

export function publicTrafficCreativeContext(row: TrafficCreative): NonNullable<import("@workspace/db").LeadOrigin["trafficCreative"]> {
  return {
    id: row.id,
    slug: row.publicSlug,
    description: row.description,
    mediaType: row.mediaType,
    mediaMimeType: row.mediaMimeType,
    mediaUrl: `/api/storage${row.objectPath}`,
    ...(row.preparation ? { preparation: row.preparation } : {}),
  };
}