import { ProductImage } from "./ImagePlaceholder";

export function ProductListItem({
  name,
  price,
  imageUrl,
  metadata,
  last = false,
}: {
  name: string;
  price?: string | null;
  imageUrl?: string | null;
  metadata?: string;
  last?: boolean;
}) {
  return (
    <div className={`app-product-list-item${last ? " is-last" : ""}`}>
      <ProductImage src={imageUrl} alt={name} size="md" />
      <div className="app-product-list-content">
        <p className="app-product-list-name">{name}</p>
        {metadata && <p className="app-product-list-metadata">{metadata}</p>}
        {price && <p className="app-product-list-price">{price}</p>}
      </div>
    </div>
  );
}