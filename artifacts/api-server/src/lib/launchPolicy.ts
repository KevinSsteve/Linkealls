/**
 * Reversible launch-scope switches.
 *
 * Keep these internal and fail closed at every mutating service entrypoint.
 * Existing campaign reads, payment reconciliation, metrics sync, and remote
 * pause/cancel operations deliberately remain available.
 */
export const ADVERTISING_NEW_ACTIONS_ENABLED = false;
export const NONESSENTIAL_SUMMARIES_ENABLED = false;

export const LAUNCH_FEATURE_PAUSED_CODE = "LAUNCH_FEATURE_PAUSED";

export const ADVERTISING_PAUSED_MESSAGE =
  "A criação, alteração, pagamento e publicação de anúncios está temporariamente indisponível neste lançamento. As campanhas existentes continuam disponíveis para consulta e os anúncios activos podem ser pausados ou encerrados. Campanhas já pagas que ainda não foram publicadas permanecem registadas e pendentes de revisão; nenhuma nova publicação será iniciada neste modo.";

export const PAID_CAMPAIGN_PENDING_REVIEW_MESSAGE =
  "Esta campanha já paga permanece registada e pendente de revisão. Nenhuma nova publicação será iniciada enquanto a publicidade estiver indisponível neste lançamento.";

export const NONESSENTIAL_SUMMARIES_PAUSED_MESSAGE =
  "Os resumos e lembretes não essenciais estão temporariamente indisponíveis neste lançamento.";

export class LaunchFeaturePausedError extends Error {
  readonly statusCode = 403;
  readonly code = LAUNCH_FEATURE_PAUSED_CODE;

  constructor(message: string) {
    super(message);
    this.name = "LaunchFeaturePausedError";
  }
}

export function assertAdvertisingNewActionsEnabled(): void {
  if (!ADVERTISING_NEW_ACTIONS_ENABLED) {
    throw new LaunchFeaturePausedError(ADVERTISING_PAUSED_MESSAGE);
  }
}

export function assertNonessentialSummariesEnabled(): void {
  if (!NONESSENTIAL_SUMMARIES_ENABLED) {
    throw new LaunchFeaturePausedError(NONESSENTIAL_SUMMARIES_PAUSED_MESSAGE);
  }
}

export function launchFeaturePausedPayload(error: LaunchFeaturePausedError): {
  error: string;
  code: typeof LAUNCH_FEATURE_PAUSED_CODE;
} {
  return { error: error.message, code: error.code };
}