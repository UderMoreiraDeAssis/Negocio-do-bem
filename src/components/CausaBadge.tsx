import { buscarCausa } from "@/lib/causas";

/** O selo de uma causa: verde, a cor das causas e dos selos no site. O grupo e o emoji ficam nos filtros e nas páginas das causas. */
export function CausaBadge({ slug, grande = false }: { slug: string; grande?: boolean }) {
  const causa = buscarCausa(slug);
  if (!causa) return null;
  return (
    <span
      title={causa.descricao}
      className={`inline-flex items-center rounded-full bg-folha-50 text-folha ${
        grande ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
      } font-semibold whitespace-nowrap`}
    >
      {causa.nome}
    </span>
  );
}
