import {
  db,
  leadChatRequestsTable,
  leadsTable,
  salesOutcomeEventsTable,
  type LeadCommercialMemory,
} from "@workspace/db";
import { lt, sql } from "drizzle-orm";

export const COMMERCIAL_DATA_RETENTION_DAYS = 90;

const emptyCommercialMemory: LeadCommercialMemory = {
  revision: 0,
  interests: [],
  criteria: [],
  constraints: [],
  answeredQuestions: [],
  objections: [],
  stage: "welcome",
  missingData: [],
  humanControl: "ai",
};

/** Applies the same 90-day private-memory window used by interaction memory. */
export async function purgeExpiredCommercialData(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - COMMERCIAL_DATA_RETENTION_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.delete(salesOutcomeEventsTable).where(lt(salesOutcomeEventsTable.createdAt, cutoff));
    await tx.delete(leadChatRequestsTable).where(lt(leadChatRequestsTable.updatedAt, cutoff));
    await tx.update(leadsTable)
      .set({
        commercialMemory: sql`${JSON.stringify(emptyCommercialMemory)}::jsonb || jsonb_build_object(
          'revision',
          COALESCE((${leadsTable.commercialMemory}->>'revision')::int, 0) + 1
        )`,
      })
      .where(lt(leadsTable.updatedAt, cutoff));
  });
}