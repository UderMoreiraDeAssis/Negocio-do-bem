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
