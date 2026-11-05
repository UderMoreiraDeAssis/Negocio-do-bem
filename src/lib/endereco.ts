// O endereço da página de um negócio (/empresas/<endereço>, coluna instagramUsername)
// é o @ do Instagram. Quem não tem Instagram ganha um endereço feito do nome e da
// cidade, com hífens: o Instagram não aceita hífen no @, então os dois tipos nunca
// se confundem. Só depende de src/lib/texto.ts, para os componentes também usarem.

import { normalizarTexto } from "@/lib/texto";

const ENDERECO_SEM_INSTAGRAM = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** Se o texto é o endereço de um negócio sem Instagram, como "padaria-do-bairro-recife". */
export function ehEnderecoSemInstagram(texto: unknown): texto is string {
  return typeof texto === "string" && texto.length <= 80 && ENDERECO_SEM_INSTAGRAM.test(texto);
}

/** Se o endereço do negócio é o @ dele no Instagram. */
export function temInstagram(endereco: string): boolean {
  return !endereco.includes("-");
}

/** "@padariadobairro", ou "sem Instagram" para o negócio que não tem. */
export function rotuloDoInstagram(endereco: string): string {
  return temInstagram(endereco) ? `@${endereco}` : "sem Instagram";
}

function palavras(texto: string): string[] {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * O endereço de um negócio sem Instagram: "Padaria do Bairro", em Recife, vira
 * "padaria-do-bairro-recife". A cidade no fim garante o hífen.
 */
export function enderecoSemInstagram(nome: string, cidade: string): string {
  const doNome = palavras(nome).join("-").slice(0, 50).replace(/-+$/, "") || "negocio";
  const daCidade = palavras(cidade).join("-") || "brasil";
  return `${doNome}-${daCidade}`;
}

/** O primeiro endereço livre: o próprio, ou com -2, -3… no fim quando outro negócio já usa. */
export function enderecoLivre(base: string, usados: Iterable<string>): string {
  const ocupados = new Set(usados);
  if (!ocupados.has(base)) return base;
  let numero = 2;
  while (ocupados.has(`${base}-${numero}`)) numero++;
  return `${base}-${numero}`;
}

/** Detalhes opcionais: cadastros antigos continuam válidos com apenas cidade e UF. */
export type Endereco = {
  regiaoAdministrativa?: string | null;
  bairro?: string | null;
  localidade?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  enderecoPublico?: boolean;
};

export const CAMPOS_ENDERECO = ["regiaoAdministrativa", "bairro", "localidade", "cep", "logradouro", "numero", "complemento"] as const;
export type CampoEndereco = (typeof CAMPOS_ENDERECO)[number] | "municipio";

/** Os 8 dígitos do CEP, aceitando "01001000" ou "01001-000"; null para qualquer outro formato. */
export function limparCep(valor: string): string | null {
  const partes = /^\s*(\d{5})-?(\d{3})\s*$/.exec(valor);
  return partes ? `${partes[1]}${partes[2]}` : null;
}

export function formatarLocalizacao(empresa: Endereco & { cidade: string; uf: string }): string {
  const detalhes = [...new Set([empresa.bairro, empresa.localidade, empresa.regiaoAdministrativa].filter(Boolean))];
  return [...detalhes, `${empresa.cidade}, ${empresa.uf}`].join(" · ");
}

/** Só a edição pelo dono/moderação pode autorizar a publicação do endereço postal. */
export function enderecoPostalPublico(empresa: Endereco): string | null {
  if (!empresa.enderecoPublico) return null;
  return [
    [empresa.logradouro, empresa.numero].filter(Boolean).join(", "),
    empresa.complemento,
    empresa.cep ? `CEP ${empresa.cep.slice(0, 5)}-${empresa.cep.slice(5)}` : null,
  ].filter(Boolean).join(" · ") || null;
}
