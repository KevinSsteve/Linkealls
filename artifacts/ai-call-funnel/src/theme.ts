/**
 * Linkealls / WhatsApp Business design tokens — single source of truth.
 * Import this everywhere instead of defining local `const C = { ... }`.
 */
export const C = {
  // ── Backgrounds ────────────────────────────────────────────────────────────
  /** Alias for appBg — keep pages compatible with old local `C.bg` */
  bg:            "#F0F2F5",
  appBg:         "#F0F2F5",
  white:         "#FFFFFF",
  chatWallpaper: "#E5DDD5",
  chatBg:        "#E5DDD5",
  bubOut:        "#D9FDD3",
  bubIn:         "#FFFFFF",

  // ── WA Brand ───────────────────────────────────────────────────────────────
  green:         "#25D366",
  /** Darker teal used for text on green backgrounds */
  greenDark:     "#128C7E",
  /** Old legacy green kept for compatibility */
  greenLegacy:   "#00A884",
  /** Dark green used for chat/owner headers */
  headerBg:      "#075E54",

  // ── Text ───────────────────────────────────────────────────────────────────
  text:          "#111B21",
  text2:         "#667781",
  text3:         "#8696A0",

  // ── Chat bubbles ───────────────────────────────────────────────────────────
  bubbleUser:    "#D9FDD3",
  bubbleBot:     "#FFFFFF",

  // ── UI chrome ──────────────────────────────────────────────────────────────
  border:        "#E9EDEF",
  inputBg:       "#F0F2F5",

  // ── Feedback ───────────────────────────────────────────────────────────────
  successBg:     "#D9FDD3",
  successText:   "#128C7E",
  errorBg:       "#FFEBEE",
  errorText:     "#C62828",
  errorBorder:   "#FFCDD2",
  warnBg:        "#FFF8E1",
  warnText:      "#E65100",
} as const;

export type ColorToken = keyof typeof C;
