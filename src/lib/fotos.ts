// Regras das fotos enviadas pelo site, usadas no navegador e no servidor.

export const TIPOS_DE_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoDeFoto = (typeof TIPOS_DE_FOTO)[number];

/** Limite por foto, com folga para o limite de 4 MB das Server Actions (next.config.ts). */
export const TAMANHO_MAXIMO_FOTO = 3 * 1024 * 1024;

/**
 * Só mostramos imagens guardadas pelo próprio site: as do Vercel Blob ou, em
 * desenvolvimento, as da pasta public/enviados. Uma imagem de outro endereço
 * avisaria aquele servidor a cada visita ao perfil.
 *
 * Vale qualquer store do Vercel Blob, não um endereço fixo: a produção e os
 * previews guardam as fotos em stores diferentes, cada um com o seu endereço.
 */
export function ehFotoDoSite(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("/enviados/")) return !url.includes("..") && !url.includes("\\");
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
