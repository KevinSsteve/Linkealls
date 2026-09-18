/**
 * Linkealls — Design System Tokens
 * Single source of truth. Import this everywhere.
 *
 * Brand philosophy: simple → reliable → professional → commercial → premium
 * Reference: Stripe clarity with the familiar rhythm of WhatsApp.
 */
export const C = {
  // ── App backgrounds ────────────────────────────────────────────────────────
  bg:            "#f8f5ee",
  appBg:         "#f8f5ee",
  white:         "#fffdf8",
  surface:       "#fffdf8",

  // ── Linkealls brand — warm confident ──────────────────────────────────────
  green:         "#246a59",
  greenDark:     "#174e42",
  greenLight:    "#dff1e9",
  greenMuted:    "#dff1e9",
  /** @deprecated legacy name kept for existing consumers */
  greenLegacy:   "#246a59",
  /** Dark header used for chat and detail views */
  headerBg:      "#17131f",
  stripe:        "#246a59",
  navy:          "#17131f",
  success:       "#246a59",

  // ── Text ───────────────────────────────────────────────────────────────────
  text:          "#17131f",
  text2:         "#6e6874",
  text3:         "#716b75",
  ink:           "#17131f",
  inkSoft:       "#6e6874",
  inkFaint:      "#716b75",

  // ── Chat ───────────────────────────────────────────────────────────────────
  chatBg:        "#f4efe8",
  chatWallpaper: "#f4efe8",
  bubOut:        "#dff1e9",
  bubIn:         "#fffdf8",
  bubbleUser:    "#dff1e9",
  bubbleBot:     "#fffdf8",

  // ── UI chrome ───────────────────────────────────────────────────────────────
  border:        "#e8e1d9",
  borderSoft:    "#f0ebe4",
  subtle:        "#f4efe8",
  inputBg:       "#fffdf8",

  // ── Layout ─────────────────────────────────────────────────────────────────
  gutter:        16,
  gutterWide:    20,
  controlHeight: 44,
  radiusSm:      8,
  radiusMd:      12,
  radiusLg:      16,

  // ── Feedback ────────────────────────────────────────────────────────────────
  successBg:     "#dff1e9",
  successText:   "#174e42",
  successBorder: "#246a59",
  errorBg:       "#fde9e7",
  errorText:     "#b34235",
  errorBorder:   "#e5ada5",
  warnBg:        "#fff6e5",
  warnText:      "#d97706",
  warnBorder:    "#fde68a",
} as const;

export type ColorToken = keyof typeof C;
