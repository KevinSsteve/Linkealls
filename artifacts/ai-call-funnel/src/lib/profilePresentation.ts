import type { BusinessProfile } from "./api";

export type ProfileEditorTarget =
  | "identity" | "avatar" | "description"
  | "address" | "hours" | "phone" | "email" | "website"
  | "catalog" | "offerings" | "links";

export type CatalogSettingsPatch = Partial<Pick<BusinessProfile, "catalogEnabled" | "catalogSlug">>;

/** Matches the public endpoint: an enabled, named business may have no products. */
export function getCatalogVisibility(
  profile: Pick<BusinessProfile, "name" | "catalogEnabled" | "offerings">,
) {
  if (profile.catalogEnabled === false) {
    return {
      kind: "hidden" as const,
      isPublic: false,
      label: "Catálogo oculto",
      description: "Os clientes não conseguem abrir o catálogo. Podes voltar a mostrá-lo nas definições.",
    };
  }
  if (!profile.name.trim()) {
    return {
      kind: "incomplete" as const,
      isPublic: false,
      label: "Falta o nome do negócio",
      description: "Adiciona o nome para disponibilizar a página aos clientes.",
    };
  }
  return {
    kind: "visible" as const,
    isPublic: true,
    label: "Catálogo visível",
    description: profile.offerings.length === 0
      ? "A tua página está pública, ainda sem produtos ou serviços."
      : "Os clientes já podem ver a tua página, produtos e serviços.",
  };
}