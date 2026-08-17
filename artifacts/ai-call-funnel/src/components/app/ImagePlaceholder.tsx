import { Image as ImageIcon, Store } from "lucide-react";

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
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className={`app-business-avatar is-${size}`}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <>
          <Store size={size === "lg" ? 22 : 16} strokeWidth={1.6} />
          <span className="sr-only">{initials || name}</span>
        </>
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