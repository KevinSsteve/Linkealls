/**
 * Linkealls — Design System Tokens
 * Single source of truth. Import this everywhere.
 *
 * Brand philosophy: simple → reliable → professional → commercial → premium
 * Reference: Linear, Stripe, Notion clarity — NOT WhatsApp green.
 */
export const C = {
  // ── App backgrounds ────────────────────────────────────────────────────────
  bg:            "#F8F9FA",   // shared app shell background
  appBg:         "#F8F9FA",
  white:         "#FFFFFF",   // surface / card background
  surface:       "#FFFFFF",

  // ── Linkealls brand ─────────────────────────────────────────────────────────
  green:         "#16A34A",   // brand green (Linkealls — not WhatsApp's #25D366)
  greenDark:     "#166534",   // deep green — text on light, header backgrounds
  greenLight:    "#DCFCE7",   // mint tint — active pills, badge backgrounds
  greenMuted:    "#F0FDF4",   // barely-green — hover states, subtle tints
  /** @deprecated keep for chat bubble compat */
  greenLegacy:   "#16A34A",
  /** Dark green header (chat detail headers) */
  headerBg:      "#166534",

  // ── Text ───────────────────────────────────────────────────────────────────
  text:          "#111111",   // shared primary text
  text2:         "#6B7280",   // gray-500 — secondary / supporting
  text3:         "#9CA3AF",   // gray-400 — muted / placeholders
  ink:           "#111111",
  inkSoft:       "#6B7280",
  inkFaint:      "#9CA3AF",

  // ── Chat (intentionally WhatsApp-style — this IS a chat product) ──────────
  chatBg:        "#E5DDD5",
  chatWallpaper: "#E5DDD5",
  bubOut:        "#D9FDD3",   // visitor/user bubble
  bubIn:         "#FFFFFF",   // AI bubble
  bubbleUser:    "#D9FDD3",
  bubbleBot:     "#FFFFFF",

  // ── UI chrome ───────────────────────────────────────────────────────────────
  border:        "#E5E7EB",   // gray-200 — subtle dividers
  borderSoft:    "#F3F4F6",
  subtle:        "#F3F4F6",
  inputBg:       "#F3F4F6",   // gray-100 — input fields

  // ── Layout ─────────────────────────────────────────────────────────────────
  gutter:        16,
  gutterWide:    20,
  controlHeight: 44,
  radiusSm:      8,
  radiusMd:      12,
  radiusLg:      16,

  // ── Feedback ────────────────────────────────────────────────────────────────
  successBg:     "#F0FDF4",
  successText:   "#15803D",
  successBorder: "#BBF7D0",
  errorBg:       "#FEF2F2",
  errorText:     "#DC2626",
  errorBorder:   "#FECACA",
  warnBg:        "#FFFBEB",
  warnText:      "#D97706",
  warnBorder:    "#FDE68A",
} as const;

export type ColorToken = keyof typeof C;
