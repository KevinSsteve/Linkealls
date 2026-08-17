/**
 * Offline baseline of the Meta advertising rules used during creative review.
 * Keeping this document in the server means image review does not depend on a
 * live documentation request and can be versioned with the publish contract.
 */
export const META_AD_POLICY_VERSION = "meta-baseline-2026-08";

export const META_AD_POLICY = {
  prohibited: [
    "discriminatory or exclusionary targeting based on protected characteristics",
    "personal attributes stated or implied about the viewer, including health, debt, age, religion or sexuality",
    "misleading claims, guaranteed results, false urgency or deceptive before-and-after transformations",
    "illegal drugs, unsafe supplements, weapons, counterfeit goods, adult sexual content or exploitation",
    "graphic violence, shocking imagery, hateful content or dangerous activities",
    "copyright or trademark misuse when the advertiser does not have the right to use it",
  ],
  restricted: [
    "health, beauty, finance, employment, housing, alcohol, gambling and political content require extra review",
    "text and visuals must match the product actually offered",
    "landing page and call to action must be functional and consistent with the ad",
    "avoid excessive text, low-quality crops, clickbait and unsupported numerical claims",
  ],
} as const;

export const META_AD_POLICY_PROMPT = [
  `Política local ${META_AD_POLICY_VERSION}.`,
  "Classifica a imagem e o texto do anúncio antes de publicar.",
  "Rejeita se houver qualquer item proibido. Marca needs_review se houver um item restrito ou dúvida.",
  "Itens proibidos:",
  ...META_AD_POLICY.prohibited.map((item) => `- ${item}`),
  "Itens restritos:",
  ...META_AD_POLICY.restricted.map((item) => `- ${item}`),
].join("\n");