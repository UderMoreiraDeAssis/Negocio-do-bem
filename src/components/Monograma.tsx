import { iniciais } from "@/lib/texto";

// Pares de cores suaves; cada negócio ganha sempre o mesmo, a partir do @.
const PALETAS = [
  "from-coral-100 to-amber-100 text-coral-700",
  "from-emerald-100 to-lime-50 text-emerald-800",
  "from-sky-100 to-indigo-50 text-sky-800",
  "from-violet-100 to-pink-50 text-violet-800",
  "from-amber-100 to-yellow-50 text-amber-800",
  "from-rose-100 to-orange-50 text-rose-800",
];

export function paletaDe(chave: string): string {
  let soma = 0;
  for (const c of chave) soma = (soma * 31 + c.charCodeAt(0)) >>> 0;
  return PALETAS[soma % PALETAS.length]!;
}

export function Monograma({ nome, chave, tamanho = "md" }: { nome: string; chave: string; tamanho?: "md" | "lg" }) {
  const dimensoes = tamanho === "lg" ? "h-24 w-24 text-3xl ring-4" : "h-12 w-12 text-base ring-2";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-display font-semibold ring-superficie ${dimensoes} ${paletaDe(chave)}`}
    >
      {iniciais(nome)}
    </span>
  );
}
