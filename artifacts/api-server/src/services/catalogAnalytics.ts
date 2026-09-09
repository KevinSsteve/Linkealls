import { createHash } from "crypto";
import { and, count, eq, sql } from "drizzle-orm";
import {
  catalogAnalyticsEventsTable,
  db,
  type BusinessProfile,
  type CatalogAnalyticsEventType,
  type Offering,
} from "@workspace/db";

export interface CatalogAnalytics {
  catalogVisitors: number;
  productClicks: number;
  products: Array<{
    key: string;
    name: string;
    clicks: number;
  }>;
}

/** Deterministic key that survives catalogue ordering changes. */
export function getOfferingAnalyticsKey(offering: Offering): string {
  return createHash("sha256")
    .update(`${offering.name}\u0000${offering.description}\u0000${offering.price}`)
    .digest("hex")
    .slice(0, 24);
}

export function withOfferingAnalyticsKey<T extends Offering>(offering: T): T & { analyticsKey: string } {
  return { ...offering, analyticsKey: getOfferingAnalyticsKey(offering) };
}

function hashVisitorId(businessId: number, visitorId: string): string {
  return createHash("sha256")
    .update(`${businessId}\u0000${visitorId}`)
    .digest("hex");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordCatalogEvent(input: {
  businessId: number;
  eventType: CatalogAnalyticsEventType;
  offeringKey?: string;
  visitorId: string;
}): Promise<void> {
  await db
    .insert(catalogAnalyticsEventsTable)
    .values({
      businessId: input.businessId,
      eventType: input.eventType,
      offeringKey: input.eventType === "click" ? input.offeringKey ?? "" : "",
      visitorHash: hashVisitorId(input.businessId, input.visitorId),
      eventDay: todayUtc(),
    })
    .onConflictDoNothing();
}

export async function getCatalogAnalytics(
  businessId: number,
  profile: BusinessProfile,
): Promise<CatalogAnalytics> {
  const [summary] = await db
    .select({
      catalogVisitors: sql<number>`count(distinct case when ${catalogAnalyticsEventsTable.eventType} = 'view' then ${catalogAnalyticsEventsTable.visitorHash} end)`,
      productClicks: sql<number>`count(*) filter (where ${catalogAnalyticsEventsTable.eventType} = 'click')`,
    })
    .from(catalogAnalyticsEventsTable)
    .where(eq(catalogAnalyticsEventsTable.businessId, businessId));

  const clickRows = await db
    .select({
      key: catalogAnalyticsEventsTable.offeringKey,
      clicks: count(),
    })
    .from(catalogAnalyticsEventsTable)
    .where(and(
      eq(catalogAnalyticsEventsTable.businessId, businessId),
      eq(catalogAnalyticsEventsTable.eventType, "click"),
    ))
    .groupBy(catalogAnalyticsEventsTable.offeringKey);

  const clicksByKey = new Map(clickRows.map((row) => [row.key, Number(row.clicks)]));
  return {
    catalogVisitors: Number(summary?.catalogVisitors ?? 0),
    productClicks: Number(summary?.productClicks ?? 0),
    products: profile.offerings.map((offering) => {
      const key = getOfferingAnalyticsKey(offering);
      return { key, name: offering.name, clicks: clicksByKey.get(key) ?? 0 };
    }),
  };
}