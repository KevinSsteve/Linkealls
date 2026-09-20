import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  trafficCreativesTable,
  trafficCreativeUploadsTable,
  type InsertTrafficCreative,
  type TrafficCreative,
  type TrafficCreativeMediaType,
} from "@workspace/db";

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

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let suffix = 2;
  while ((await db.select({ id: trafficCreativesTable.id }).from(trafficCreativesTable).where(eq(trafficCreativesTable.publicSlug, slug)).limit(1)).length) {
    slug = `${slugify(base)}-${suffix++}`;
  }
  return slug;
}

export async function listTrafficCreatives(businessId: number): Promise<TrafficCreative[]> {
  return db.select().from(trafficCreativesTable)
    .where(eq(trafficCreativesTable.businessId, businessId))
    .orderBy(desc(trafficCreativesTable.createdAt));
}

export async function createTrafficCreative(
  input: { description: string; objectPath: string; mediaMimeType: string },
  businessId: number,
  businessSlug: string,
): Promise<TrafficCreative> {
  const mediaType = validateTrafficCreativeMedia(input.objectPath, input.mediaMimeType, businessSlug);
  const publicSlug = await uniqueSlug(input.description.slice(0, 60));
  const values: InsertTrafficCreative = {
    businessId,
    description: input.description,
    objectPath: input.objectPath,
    mediaMimeType: input.mediaMimeType,
    mediaType,
    publicSlug,
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
    return creative;
  });
}

export async function updateTrafficCreative(
  id: string,
  patch: { description?: string; active?: boolean },
  businessId: number,
): Promise<TrafficCreative | null> {
  const rows = await db.update(trafficCreativesTable)
    .set({
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.active !== undefined ? { active: patch.active ? 1 : 0 } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(trafficCreativesTable.id, id), eq(trafficCreativesTable.businessId, businessId)))
    .returning();
  return rows[0] ?? null;
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
  return rows[0] ?? null;
}

export function publicTrafficCreativeContext(row: TrafficCreative): NonNullable<import("@workspace/db").LeadOrigin["trafficCreative"]> {
  return {
    id: row.id,
    slug: row.publicSlug,
    description: row.description,
    mediaType: row.mediaType,
    mediaMimeType: row.mediaMimeType,
    mediaUrl: `/api/storage${row.objectPath}`,
  };
}