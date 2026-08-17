/**
 * Real ad campaigns — payment in Kwanzas, publication via Zernio, metrics sync.
 *
 * Money invariants (same as payments.ts):
 *  - Wallet balance is ALWAYS derived from SUM(wallet_ledger.amount).
 *  - Campaign wallet debit is idempotent via the unique partial index on
 *    wallet_ledger.campaign_id; the per-business advisory lock (917001) is the
 *    same one used by payouts so debits and payouts serialize together.
 *  - FX rate (AOA/USD incl. margin) is locked at payment time and stored on
 *    the campaign for audit.
 */
import { and, eq, sql, isNotNull, inArray } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignPaymentAttemptsTable,
  walletLedgerTable,
  businessProfilesTable,
  type Campaign,
  type CampaignSetup,
} from "@workspace/db";
import { newMerchantTransactionId, PaymentError } from "./payments.js";
import { createGpoCharge, IS_SIMULATION as IS_EKWANZA_SIMULATION } from "./ekwanza.js";
import * as zernio from "./zernio.js";
import { effectiveAoaPerUsd, aoaToWholeUsd } from "./fx.js";
import { sendPushToOwner } from "./notifications.js";
import { logger } from "../lib/logger.js";

export const CAMPAIGN_MIN_BUDGET_AOA = 5_000;

/** Development previews must never charge or publish real campaigns. */
const IS_DEV_ENV = process.env["NODE_ENV"] === "development";
const hasManagedGemini = Boolean(
  process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"] &&
  process.env["AI_INTEGRATIONS_GEMINI_API_KEY"],
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOwnedCampaign(campaignId: string, businessId: number): Promise<Campaign> {
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.businessId, businessId)))
    .limit(1);
  const campaign = rows[0];
  if (!campaign) throw new PaymentError("Campanha não encontrada", 404);
  return campaign;
}

function lockFxOnPayment(budgetAoa: number): { fxRate: string; budgetUsd: string } {
  const rate = effectiveAoaPerUsd();
  // Whole USD: exactly what Zernio will be funded with — same number the
  // owner saw in the quote, no silent rounding at publish time.
  const usd = aoaToWholeUsd(budgetAoa, rate);
  if (usd < 1) throw new PaymentError("Orçamento demasiado baixo para publicar (mínimo ~1 USD)");
  return { fxRate: rate.toFixed(4), budgetUsd: usd.toFixed(2) };
}

function assertPayable(campaign: Campaign): void {
  if (campaign.paymentStatus === "pago") throw new PaymentError("Esta campanha já está paga");
  if (campaign.paymentStatus === "pendente") throw new PaymentError("Pagamento já em curso — aguarda a confirmação");
  if (campaign.budget < CAMPAIGN_MIN_BUDGET_AOA) {
    throw new PaymentError(`Orçamento mínimo: ${CAMPAIGN_MIN_BUDGET_AOA.toLocaleString("pt-AO")} Kz`);
  }
  if (!["google", "instagram", "facebook", "tiktok", "meta"].includes(campaign.platform)) {
    throw new PaymentError("Plataforma inválida");
  }
  if (campaign.platform === "google") {
    throw new PaymentError("Google Ads ainda não está disponível — usa TikTok, Facebook ou Instagram");
  }
  const channel: zernio.ZernioChannel = campaign.platform === "tiktok" ? "tiktok" : "meta";
  if (!zernio.isChannelConfigured(channel)) {
    throw new PaymentError(
      `O canal Meta ainda não está configurado na plataforma — contacta o suporte antes de pagar`,
      503,
    );
  }
  // Shared secrets are available to development workflows too, but a preview
  // must never be able to spend real money. Real campaigns go through the
  // published production app only.
  if (IS_DEV_ENV && !zernio.IS_ZERNIO_SIMULATION) {
    throw new PaymentError(
      "Pagamentos reais estão disponíveis apenas na aplicação publicada",
      503,
    );
  }
  // Never collect real money for a simulated ad outside development: the
  // gateway would only fabricate a fake publication. Fail closed in prod.
  // Fail-closed default: simulated payments are only allowed in an explicit
  // development environment. Unset NODE_ENV (e.g. a misconfigured deploy)
  // blocks charges rather than silently accepting money for fake ads.
  if (zernio.IS_ZERNIO_SIMULATION && !IS_DEV_ENV) {
    throw new PaymentError(
      "A publicação de anúncios reais ainda não está ativa — o pagamento está bloqueado até a plataforma estar configurada",
      503,
    );
  }
  // Every prerequisite for actually publishing must exist BEFORE any money
  // moves — an owner must never be charged into a flow that cannot complete.
  if (!publicBaseUrl()) {
    throw new PaymentError(
      "Publicação indisponível: URL pública da plataforma não configurada — contacta o suporte antes de pagar",
      503,
    );
  }

  const setup = campaign.campaignSetup as CampaignSetup | null;
  if (campaign.platform === "meta") {
    if (!["awareness", "traffic", "engagement", "lead_generation"].includes(campaign.objective)) {
      throw new PaymentError("Escolhe um objetivo Meta compatível antes de pagar");
    }
    if (
      !setup?.audience?.location ||
      !setup.audience.locationId ||
      !setup.audience.ageMin ||
      !setup.audience.ageMax
    ) {
      throw new PaymentError("Define o público da campanha antes de pagar");
    }
    if (campaign.creativeStatus !== "pronto" || !campaign.creativeJson) {
      throw new PaymentError("Revê e aprova o criativo antes de pagar");
    }
    if (setup.creative.source === "gemini" && !hasManagedGemini && !process.env["GEMINI_API_KEY"]) {
      throw new PaymentError(
        "Publicação indisponível: geração de imagens Gemini não está configurada — contacta o suporte antes de pagar",
        503,
      );
    }
  } else if (!zernio.IS_ZERNIO_SIMULATION && !process.env["GEMINI_API_KEY"]) {
    throw new PaymentError(
      "Publicação indisponível: geração de criativos não configurada — contacta o suporte antes de pagar",
      503,
    );
  }
}

// ─── Payment: wallet debit ────────────────────────────────────────────────────

export async function payCampaignFromWallet(
  campaignId: string,
  businessId: number,
): Promise<Campaign> {
  const campaign = await getOwnedCampaign(campaignId, businessId);
  assertPayable(campaign);
  const { fxRate, budgetUsd } = lockFxOnPayment(campaign.budget);

  const updated = await db.transaction(async (tx) => {
    // Same lock as payouts: balance check + debit must be serialized per business.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(917001, ${businessId})`);
    const balRows = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.businessId, businessId));
    const balance = Number(balRows[0]?.balance ?? 0);
    if (balance < campaign.budget) {
      throw new PaymentError(
        `Saldo insuficiente na carteira (${balance.toLocaleString("pt-AO")} Kz). Carrega a carteira ou paga por Multicaixa Express.`,
      );
    }
    await tx.insert(walletLedgerTable).values({
      businessId,
      type: "campanha",
      amount: (-campaign.budget).toFixed(2),
      campaignId: campaign.id,
      description: `Orçamento da campanha: ${campaign.name}`,
    });
    const rows = await tx
      .update(campaignsTable)
      .set({
        paymentStatus: "pago",
        paymentMethod: "carteira",
        paidAt: new Date(),
        fxRateAoaPerUsd: fxRate,
        budgetUsd,
        updatedAt: new Date(),
      })
      .where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.paymentStatus, "nao_pago")))
      .returning();
    if (rows.length === 0) throw new PaymentError("Esta campanha já está paga");
    return rows[0]!;
  });
  return updated;
}

// ─── Payment: direct Multicaixa Express charge ───────────────────────────────

export async function payCampaignWithMulticaixa(
  campaignId: string,
  businessId: number,
  phone: string,
): Promise<Campaign> {
  const campaign = await getOwnedCampaign(campaignId, businessId);
  assertPayable(campaign);
  // A simulated Multicaixa charge must never gate a real ad: in production
  // with real Zernio but missing e-kwanza credentials, fail closed.
  if (IS_EKWANZA_SIMULATION && !IS_DEV_ENV) {
    throw new PaymentError(
      "Pagamento por Multicaixa Express indisponível de momento — usa a carteira",
      503,
    );
  }
  const { fxRate, budgetUsd } = lockFxOnPayment(campaign.budget);

  const merchantTransactionId = newMerchantTransactionId("LKC");
  const updatedRows = await db
    .update(campaignsTable)
    .set({
      paymentStatus: "pendente",
      paymentMethod: "multicaixa",
      paymentMerchantTransactionId: merchantTransactionId,
      fxRateAoaPerUsd: fxRate,
      budgetUsd,
      updatedAt: new Date(),
    })
    .where(and(
      eq(campaignsTable.id, campaign.id),
      inArray(campaignsTable.paymentStatus, ["nao_pago", "falhado"]),
    ))
    .returning();
  const updated = updatedRows[0];
  if (!updated) throw new PaymentError("Pagamento já em curso ou concluído");

  // Immutable record of this attempt — retries create new rows, so a delayed
  // webhook for ANY earlier attempt can always be matched (never lost).
  await db.insert(campaignPaymentAttemptsTable).values({
    campaignId: campaign.id,
    merchantTransactionId,
  });

  const fireCharge = async () => {
    try {
      const charge = await createGpoCharge({
        amount: campaign.budget,
        merchantTransactionId,
        phoneNumber: phone,
        description: `Campanha ${campaign.name}`,
      });
      if (charge.outcome === "paid") {
        try {
          await settleCampaignGpoPayment(merchantTransactionId, 1);
        } catch (settleErr) {
          logger.error({ err: settleErr, merchantTransactionId }, "campaign paid but local settlement failed — awaiting webhook/reconciliation");
        }
      } else if (charge.outcome === "failed") {
        await settleCampaignGpoPayment(merchantTransactionId, 0);
      }
      // outcome === "pending": leave the campaign pendente — the webhook settles it.
    } catch (err) {
      // Unknown outcome (network error / timeout): do NOT mark falhado — the
      // charge may still have succeeded. Leave pendente for the webhook or
      // reconciliation; marking it failed here could allow a double charge.
      logger.error({ err, merchantTransactionId }, "campaign GPO charge errored with unknown outcome — left pendente for webhook/reconciliation");
    }
  };
  setImmediate(() => { void fireCharge(); });
  return updated;
}

/**
 * Settles a campaign GPO charge (called from settleGpoPayment webhook path and
 * from the background charge above). Idempotent: only transitions "pendente".
 * Returns false when the merchantTransactionId doesn't belong to a campaign.
 */
export async function settleCampaignGpoPayment(
  merchantTransactionId: string,
  operationStatus: number,
  _ekwanzaTransactionId?: string,
): Promise<boolean> {
  // Attempts table is the settlement authority: it survives retries that
  // overwrite the campaign's current merchantTransactionId.
  const attemptRows = await db
    .select()
    .from(campaignPaymentAttemptsTable)
    .where(eq(campaignPaymentAttemptsTable.merchantTransactionId, merchantTransactionId))
    .limit(1);
  const attempt = attemptRows[0];
  if (!attempt) return false;

  const rows = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, attempt.campaignId))
    .limit(1);
  const campaign = rows[0];
  if (!campaign) return false;

  if (operationStatus === 1) {
    if (campaign.paymentStatus === "pago") {
      // Campaign already paid (possibly via a NEWER attempt): the owner was
      // charged twice. Record it loudly for support/refund — never drop it.
      const dup = await db
        .update(campaignPaymentAttemptsTable)
        .set({ status: "pago_duplicado", updatedAt: new Date() })
        .where(and(
          eq(campaignPaymentAttemptsTable.id, attempt.id),
          eq(campaignPaymentAttemptsTable.status, "pendente"),
        ))
        .returning();
      if (dup.length > 0) {
        logger.error(
          { merchantTransactionId, campaignId: campaign.id },
          "DUPLICATE campaign payment: charge settled after campaign already paid — needs manual refund",
        );
      }
      return true;
    }
    await db
      .update(campaignPaymentAttemptsTable)
      .set({ status: "pago", updatedAt: new Date() })
      .where(eq(campaignPaymentAttemptsTable.id, attempt.id));
    const updated = await db
      .update(campaignsTable)
      .set({ paymentStatus: "pago", paidAt: new Date(), updatedAt: new Date() })
      // A definitive "paid" callback wins even over a locally-recorded failure
      // (delayed webhook after a transient error).
      .where(and(
        eq(campaignsTable.id, campaign.id),
        inArray(campaignsTable.paymentStatus, ["pendente", "falhado"]),
      ))
      .returning();
    if (updated.length > 0 && campaign.businessId) {
      void sendPushToOwner({
        title: "Orçamento da campanha pago!",
        body: `"${campaign.name}" — ${campaign.budget.toLocaleString("pt-AO")} Kz. Já podes gerar o criativo e publicar.`,
        tag: `campaign-pay-${campaign.id}`,
        url: await ownerCampaignUrl(campaign),
      }, campaign.businessId).catch(() => {});
    }
  } else {
    await db
      .update(campaignPaymentAttemptsTable)
      .set({ status: "falhado", updatedAt: new Date() })
      .where(and(
        eq(campaignPaymentAttemptsTable.id, attempt.id),
        eq(campaignPaymentAttemptsTable.status, "pendente"),
      ));
    // Only fail the campaign if this attempt is still its CURRENT one.
    await db
      .update(campaignsTable)
      .set({ paymentStatus: "falhado", updatedAt: new Date() })
      .where(and(
        eq(campaignsTable.id, campaign.id),
        eq(campaignsTable.paymentMerchantTransactionId, merchantTransactionId),
        eq(campaignsTable.paymentStatus, "pendente"),
      ));
  }
  return true;
}

async function ownerCampaignUrl(campaign: Campaign): Promise<string> {
  if (!campaign.businessId) return "/";
  const rows = await db
    .select({ slug: businessProfilesTable.slug })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, campaign.businessId))
    .limit(1);
  const slug = rows[0]?.slug;
  return slug ? `/e/${slug}/dono/campanhas/${campaign.id}` : "/";
}

// ─── Publish ──────────────────────────────────────────────────────────────────

/** Absolute public base URL used to build media/destination links for Zernio. */
function publicBaseUrl(): string {
  const configured = process.env["PUBLIC_BASE_URL"];
  if (configured) return configured.replace(/\/$/, "");
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}`;
  return "";
}

export async function publishCampaign(campaignId: string, businessId: number): Promise<Campaign> {
  const campaign = await getOwnedCampaign(campaignId, businessId);
  if (IS_DEV_ENV && !zernio.IS_ZERNIO_SIMULATION) {
    throw new PaymentError(
      "A publicação real está disponível apenas na aplicação publicada",
      503,
    );
  }
  if (campaign.paymentStatus !== "pago") throw new PaymentError("Paga o orçamento antes de publicar");
  if (campaign.creativeStatus !== "pronto" || !campaign.creativeJson) {
    throw new PaymentError("Gera e aprova o criativo antes de publicar");
  }
  if (!["nao_publicada", "erro", "rejeitada"].includes(campaign.publishStatus)) {
    throw new PaymentError("Esta campanha já foi publicada");
  }
  if (!campaign.budgetUsd) throw new PaymentError("Orçamento USD em falta — contacta o suporte");

  const profileRows = await db
    .select({ catalogSlug: businessProfilesTable.catalogSlug, slug: businessProfilesTable.slug })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) throw new PaymentError("Negócio não encontrado", 404);

  const base = publicBaseUrl();
  if (!base && !zernio.IS_ZERNIO_SIMULATION) {
    throw new PaymentError("PUBLIC_BASE_URL não configurado — necessário para publicar anúncios reais", 500);
  }
  const destPath = profile.catalogSlug ? `/c/${profile.catalogSlug}` : `/e/${profile.slug}`;
  const linkUrl = `${base}${destPath}?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`;
  const mediaUrl = `${base}${campaign.creativeJson.mediaUrl}`;
  const channel: zernio.ZernioChannel = campaign.platform === "tiktok" ? "tiktok" : "meta";

  // Mark as "a_publicar" first (optimistic lock against double publish).
  const locked = await db
    .update(campaignsTable)
    .set({ publishStatus: "a_publicar", publishError: null, updatedAt: new Date() })
    .where(and(
      eq(campaignsTable.id, campaign.id),
      inArray(campaignsTable.publishStatus, ["nao_publicada", "erro", "rejeitada"]),
    ))
    .returning();
  if (locked.length === 0) throw new PaymentError("Publicação já em curso");

  try {
    const result = await zernio.createAd({
      channel,
      name: `Linkealls ${campaign.utmSlug}`,
      budgetUsd: Math.floor(Number(campaign.budgetUsd)),
      durationDays: campaign.durationDays,
      headline: campaign.creativeJson.headline,
      body: campaign.creativeJson.body,
      callToAction: campaign.creativeJson.callToAction,
      mediaUrl,
      mediaType: campaign.creativeJson.mediaType,
      linkUrl,
      objective: campaign.objective,
      audience: (campaign.campaignSetup as CampaignSetup | null)?.audience,
      idempotencyKey: `linkealls-pub-${campaign.id}`,
    });
    const publishStatus = result.reviewStatus && result.reviewStatus !== "APPROVED" ? "em_revisao" : "ativa";
    const rows = await db
      .update(campaignsTable)
      .set({
        publishStatus,
        zernioAdId: result.adId,
        zernioCampaignId: result.campaignId,
        zernioAdSetId: result.adSetId,
        publishedSimulated: result.simulated ? 1 : 0,
        publishedAt: new Date(),
        status: "ativa",
        updatedAt: new Date(),
      })
      .where(eq(campaignsTable.id, campaign.id))
      .returning();
    return rows[0]!;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao publicar";
    await db
      .update(campaignsTable)
      .set({ publishStatus: "erro", publishError: message, updatedAt: new Date() })
      .where(eq(campaignsTable.id, campaign.id));
    throw err instanceof PaymentError ? err : new PaymentError(message, 502);
  }
}

// ─── Pause / resume / end ─────────────────────────────────────────────────────

export async function controlCampaignAd(
  campaignId: string,
  businessId: number,
  action: "pause" | "resume" | "end",
): Promise<Campaign> {
  const campaign = await getOwnedCampaign(campaignId, businessId);
  if (!campaign.zernioAdId) throw new PaymentError("Esta campanha ainda não foi publicada");
  if (["encerrada", "rejeitada"].includes(campaign.publishStatus)) {
    throw new PaymentError("Esta campanha já terminou");
  }
  const simulated = campaign.publishedSimulated === 1;

  if (action === "end") {
    await zernio.cancelAd(campaign.zernioAdId, simulated);
  } else {
    await zernio.setAdStatus(campaign.zernioAdId, action, simulated);
  }

  const publishStatus = action === "end" ? "encerrada" : action === "pause" ? "pausada" : "ativa";
  const status = action === "end" ? "encerrada" : action === "pause" ? "pausada" : "ativa";
  const rows = await db
    .update(campaignsTable)
    .set({ publishStatus, status, updatedAt: new Date() })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();
  return rows[0]!;
}

// ─── Metrics sync ─────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 15 * 60_000;

export async function syncPublishedCampaigns(): Promise<void> {
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(and(
      isNotNull(campaignsTable.zernioAdId),
      inArray(campaignsTable.publishStatus, ["ativa", "em_revisao", "pausada"]),
    ))
    .limit(200);

  for (const campaign of rows) {
    try {
      const snap = await zernio.getAd(campaign.zernioAdId!, campaign.publishedSimulated === 1);
      const fxRate = Number(campaign.fxRateAoaPerUsd ?? 0);
      const spendAoa = fxRate > 0 ? Math.round(snap.spendUsd * fxRate) : campaign.totalSpend;

      let publishStatus = campaign.publishStatus;
      if (snap.reviewStatus === "REJECTED") publishStatus = "rejeitada";
      else if (snap.status === "PAUSED" && publishStatus === "ativa") publishStatus = "pausada";
      else if (["COMPLETED", "CANCELLED", "ARCHIVED", "DELETED"].includes(snap.status)) publishStatus = "encerrada";
      else if (snap.status === "ACTIVE" && publishStatus === "em_revisao" && snap.reviewStatus === "APPROVED") publishStatus = "ativa";

      // Lifetime window elapsed (counted from actual publication, not payment)
      // → cancel remotely FIRST so a real ad never keeps spending after we
      // mark it ended locally, then mark ended.
      const startedAt = campaign.publishedAt ?? campaign.paidAt;
      if (
        startedAt &&
        Date.now() > new Date(startedAt).getTime() + campaign.durationDays * 24 * 3600_000 &&
        ["ativa", "pausada", "em_revisao"].includes(publishStatus)
      ) {
        await zernio.cancelAd(campaign.zernioAdId!, campaign.publishedSimulated === 1);
        publishStatus = "encerrada";
      }

      await db
        .update(campaignsTable)
        .set({
          syncedSpendUsd: snap.spendUsd.toFixed(2),
          syncedImpressions: snap.impressions,
          syncedClicks: snap.clicks,
          totalSpend: spendAoa,
          publishStatus,
          ...(publishStatus === "encerrada" ? { status: "encerrada" as const } : {}),
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(campaignsTable.id, campaign.id));

      if (publishStatus === "rejeitada" && campaign.publishStatus !== "rejeitada" && campaign.businessId) {
        void sendPushToOwner({
          title: "Anúncio rejeitado",
          body: `A campanha "${campaign.name}" foi rejeitada pela plataforma. Regenera o criativo e tenta de novo.`,
          tag: `campaign-rej-${campaign.id}`,
          url: await ownerCampaignUrl(campaign),
        }, campaign.businessId).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err, campaignId: campaign.id }, "campaign metrics sync failed");
    }
  }
}

export function startCampaignSyncCron(): void {
  setInterval(() => {
    void syncPublishedCampaigns().catch((err) => {
      logger.error({ err }, "syncPublishedCampaigns crashed");
    });
  }, SYNC_INTERVAL_MS).unref();
  logger.info("campaign metrics sync cron started (15 min)");
}
