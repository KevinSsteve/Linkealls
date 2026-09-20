import type { SalesStrategyConfig, SalesStrategyOverrideConfig } from "@workspace/db";

export type EffectiveSalesStrategy = SalesStrategyConfig & {
  sourceCta?: string;
  focusedOffer?: string;
  expectedIntent?: string;
};

export function applySalesStrategyOverride(
  base: SalesStrategyConfig,
  override: SalesStrategyOverrideConfig | null | undefined,
  catalogOfferNames: string[],
): EffectiveSalesStrategy {
  if (!override) return { ...base };
  const exactOffer = override.focusedOffer
    ? catalogOfferNames.find((name) =>
      name.toLocaleLowerCase("pt-AO") === override.focusedOffer!.trim().toLocaleLowerCase("pt-AO"))
    : undefined;
  const questions = override.minimumQuestions?.filter(Boolean) ?? [];
  const objective = override.objective ?? base.objective;
  const objectiveActions: SalesStrategyConfig["availableActions"] =
    objective === "purchase" ? ["catalog", "checkout"]
      : objective === "quote" ? ["quote_request"]
        : objective === "appointment_request" ? ["appointment_request"]
          : objective === "visit_request" ? ["visit_request"]
            : ["contact"];
  return {
    ...base,
    objective,
    essentialQuestions: [...new Set([...questions, ...base.essentialQuestions])],
    priorityOffers: exactOffer
      ? [exactOffer, ...base.priorityOffers.filter((name) => name.toLocaleLowerCase("pt-AO") !== exactOffer.toLocaleLowerCase("pt-AO"))]
      : [...base.priorityOffers],
    focusedOffer: exactOffer,
    expectedIntent: override.expectedIntent?.trim() || undefined,
    sourceCta: override.cta?.trim() || undefined,
    availableActions: [...new Set([...objectiveActions, ...base.availableActions])],
  };
}

export function orderOfferingsForStrategy<T extends { name: string }>(
  offerings: T[],
  focusedOffer?: string,
): T[] {
  if (!focusedOffer) return offerings;
  return [
    ...offerings.filter((offering) => offering.name === focusedOffer),
    ...offerings.filter((offering) => offering.name !== focusedOffer),
  ];
}

export function isRuntimeSourceEligible(
  type: "campaign" | "traffic_creative",
  row: { active?: number; status?: string; publishStatus?: string } | null | undefined,
): boolean {
  if (!row) return false;
  return type === "traffic_creative"
    ? row.active === 1
    : row.status === "ativa" && row.publishStatus === "ativa";
}