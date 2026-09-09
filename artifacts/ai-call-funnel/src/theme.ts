/**
 * Linkealls — Design System Tokens
 * Single source of truth. Import this everywhere.
 *
 * Brand philosophy: simple → reliable → professional → commercial → premium
 * Reference: Stripe clarity with the familiar rhythm of WhatsApp.
 */
export const C = {
  // ── App backgrounds ────────────────────────────────────────────────────────
  bg:            "#F8F9FA",   // shared app shell background
  appBg:         "#F8F9FA",
  white:         "#FFFFFF",   // surface / card background
  surface:       "#FFFFFF",

  // ── Linkealls brand — Stripe-inspired ──────────────────────────────────────
  green:         "#635BFF",   // primary accent for actions and navigation
  greenDark:     "#5046E5",   // accessible accent text on light surfaces
  greenLight:    "#EEECFF",   // soft accent tint
  greenMuted:    "#F6F4FF",   // barely-purple hover surface
  /** @deprecated legacy name kept for existing consumers */
  greenLegacy:   "#635BFF",
  /** Deep navy header used for chat and detail views */
  headerBg:      "#0A2540",
  stripe:        "#635BFF",
  navy:          "#0A2540",
  success:       "#2E8B72",

  // ── Text ───────────────────────────────────────────────────────────────────
  text:          "#0A2540",   // shared primary text
  text2:         "#425466",   // secondary / supporting
  text3:         "#8898AA",   // muted / placeholders
  ink:           "#0A2540",
  inkSoft:       "#425466",
  inkFaint:      "#8898AA",

  // ── Chat (WhatsApp interaction pattern, Stripe palette) ────────────────────
  chatBg:        "#F6F9FC",
  chatWallpaper: "#F6F9FC",
  bubOut:        "#EEECFF",   // visitor/user bubble
  bubIn:         "#FFFFFF",   // AI bubble
  bubbleUser:    "#EEECFF",
  bubbleBot:     "#FFFFFF",

  // ── UI chrome ───────────────────────────────────────────────────────────────
  border:        "#E6EBF1",   // cool-gray — subtle dividers
  borderSoft:    "#F1F4F8",
  subtle:        "#F1F5F9",
  inputBg:       "#F1F5F9",   // cool-gray input fields

  // ── Layout ─────────────────────────────────────────────────────────────────
  gutter:        16,
  gutterWide:    20,
  controlHeight: 44,
  radiusSm:      8,
  radiusMd:      12,
  radiusLg:      16,

  // ── Feedback ────────────────────────────────────────────────────────────────
  successBg:     "#E8F7F1",
  successText:   "#176B55",
  successBorder: "#B8E5D5",
  errorBg:       "#FEF2F2",
  errorText:     "#DC2626",
  errorBorder:   "#FECACA",
  warnBg:        "#FFFBEB",
  warnText:      "#D97706",
  warnBorder:    "#FDE68A",
} as const;

export type ColorToken = keyof typeof C;
