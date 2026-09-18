export const D = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  inkFaint: "var(--ink-faint)",
  border: "var(--border)",
  borderSoft: "var(--border-soft)",
  subtle: "var(--subtle)",
  green: "var(--green)",
  greenDk: "var(--green-dark)",
  greenLt: "var(--green-light)",
  greenMuted: "var(--green-light)",
  errorBg: "var(--errorBg, #fde9e7)",
  errorText: "var(--errorText, #b34235)",
  errorBorder: "var(--errorBorder, #e5ada5)",
  successBg: "var(--successBg, #dff1e9)",
  successText: "var(--successText, #174e42)",
  successBorder: "var(--successBorder, #246a59)",
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