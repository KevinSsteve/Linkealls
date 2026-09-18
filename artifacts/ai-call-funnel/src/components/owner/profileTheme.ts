export const D = {
  bg: "#F6F9FC",
  surface: "#FFFFFF",
  ink: "#0A2540",
  inkSoft: "#425466",
  inkFaint: "#8898AA",
  border: "#E6EBF1",
  borderSoft: "#F1F4F8",
  subtle: "#F1F5F9",
  green: "#635BFF",
  greenDk: "#5046E5",
  greenLt: "#EEECFF",
  greenMuted: "#F6F4FF",
  errorBg: "#FEF2F2",
  errorText: "#DC2626",
  errorBorder: "#FECACA",
  successBg: "#E8F7F1",
  successText: "#176B55",
  successBorder: "#B8E5D5",
  rCard: 16,
  rInput: 12,
} as const;

const PALETTES = [
  { bg: "#EEECFF", text: "#5046E5" },
  { bg: "#DBEAFE", text: "#1D4ED8" },
  { bg: "#FEE2E2", text: "#B91C1C" },
  { bg: "#FEF3C7", text: "#B45309" },
  { bg: "#EDE9FE", text: "#6D28D9" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#CCFBF1", text: "#0F766E" },
  { bg: "#FEF9C3", text: "#A16207" },
];

export function avatarPalette(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "N";
}