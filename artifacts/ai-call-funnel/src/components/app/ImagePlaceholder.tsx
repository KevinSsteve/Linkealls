import { Image as ImageIcon } from "lucide-react";

export function ImagePlaceholder({
  label = "Sem imagem",
  rounded = "md",
}: {
  label?: string;
  rounded?: "md" | "lg" | "circle";
}) {
  return (
    <div className={`app-image-placeholder is-${rounded}`} role="img" aria-label={label}>
      <ImageIcon size={20} strokeWidth={1.6} />
    </div>
  );
}

export function BusinessAvatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const palettes = [
    { bg: "#F3E5F5", text: "#6A1B9A" },
    { bg: "#E3F2FD", text: "#0D47A1" },
    { bg: "#FCE4EC", text: "#880E4F" },
    { bg: "#E8F5E9", text: "#1B5E20" },
    { bg: "#FFF3E0", text: "#E65100" },
    { bg: "#E0F7FA", text: "#006064" },
  ];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const palette = palettes[Math.abs(hash) % palettes.length]!;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className={`app-business-avatar is-${size}`} style={{ background: palette.bg, color: palette.text }}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold">{initials || name}</span>
      )}
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  size = "md",
}: {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
}) {
  return src ? (
    <img src={src} alt={alt} className={`app-product-image is-${size}`} />
  ) : (
    <div className={`app-product-image is-${size}`}>
      <ImagePlaceholder label={`Sem imagem para ${alt}`} rounded="md" />
    </div>
  );
}