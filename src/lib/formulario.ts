import { z, type ZodError } from "zod";
import { conferirMunicipio } from "@/lib/municipios";
import { REGIOES_DF } from "@/lib/regioes-df";
import { normalizarTexto } from "@/lib/texto";

const detalheOpcional = (maximo: number) => z.string().trim().max(maximo, `Use até ${maximo} caracteres.`).transform((v) => v || null);

export const campoCep = z.string().trim()
  .refine((v) => !v || /^\d{5}-?\d{3}$/.test(v), "Digite um CEP com 8 dígitos (ex.: 01001-000).")
  .transform((v) => v.replace("-", "") || null);

export const camposEndereco = {
  regiaoAdministrativa: detalheOpcional(80).transform((valor, ctx) => {
    if (!valor) return null;
    const regiao = REGIOES_DF.find((r) => normalizarTexto(r) === normalizarTexto(valor));
    if (regiao) return regiao;
    ctx.addIssue({ code: "custom", message: "Escolha uma região administrativa do DF na lista." });
    return z.NEVER;
  }),
  bairro: detalheOpcional(100),
  localidade: detalheOpcional(100),
  cep: campoCep,
  logradouro: detalheOpcional(200),
  numero: detalheOpcional(30),
  complemento: detalheOpcional(200),
};

export function regiaoCompativel(dados: { municipio: { nome: string; uf: string }; regiaoAdministrativa: string | null }): boolean {
  return !dados.regiaoAdministrativa || (dados.municipio.nome === "Brasília" && dados.municipio.uf === "DF");
}

export const erroRegiaoCompativel = { path: ["regiaoAdministrativa"], message: "A região administrativa só se aplica a Brasília, DF. Para outras cidades, use bairro ou distrito/localidade." };

/** Cidade do campo de cidade ("Recife, PE"), conferida na lista do IBGE. Devolve o nome oficial e a UF. */
export const campoMunicipio = z
  .string()
  .max(120, "Nome de cidade muito longo.")
  .transform((valor, ctx) => {
    const resultado = conferirMunicipio(valor);
    if ("erro" in resultado) {
      ctx.addIssue({ code: "custom", message: resultado.erro });
      return z.NEVER;
    }
    return resultado.municipio;
  });

/** Site opcional: aceita "meunegocio.com.br" e devolve a URL completa, ou null se vazio. */
export const campoSite = z
  .string()
  .trim()
  .max(200)
  .transform((valor, ctx) => {
    if (!valor) return null;
    const comProtocolo = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
    try {
      const url = new URL(comProtocolo);
      if (!url.hostname.includes(".")) throw new Error();
      return url.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Digite um endereço válido (ex.: www.meunegocio.com.br)." });
      return z.NEVER;
    }
  });

/** WhatsApp opcional: aceita "(11) 99148-8052" ou "+55 11 99148-8052" e guarda só os dígitos, com o 55. */
export const campoWhatsapp = z
  .string()
  .trim()
  .max(30)
  .transform((valor, ctx) => {
    if (!valor) return null;
    let digitos = valor.replace(/\D/g, "").replace(/^0+/, "");
    if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
    // DDD sem zero, depois celular (9 + 8 dígitos) ou fixo (começa com 2 a 5).
    if (!/^55[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(digitos)) {
      ctx.addIssue({ code: "custom", message: "Digite o número com DDD (ex.: 11 99148-8052)." });
      return z.NEVER;
    }
    return digitos;
  });

/** E-mail de contato opcional, em minúsculas, ou null se vazio. */
export const campoEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, "E-mail muito longo.")
  .refine((valor) => !valor || z.email().safeParse(valor).success, "Digite um e-mail válido.")
  .transform((valor) => valor || null);

/** Estado devolvido pelas Server Actions para os formulários (useActionState). */
export type EstadoFormulario =
  | {
      erro?: string;
      erros?: Record<string, string>;
      // @ de um negócio que já está no diretório (formulário de indicação).
      existente?: string;
      // Valores enviados, para o formulário não perder o que a pessoa digitou.
      valores?: Record<string, string | string[]>;
    }
  | undefined;

/** Primeiro erro de cada campo, no formato que os formulários mostram. */
export function errosPorCampo(erro: ZodError): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const problema of erro.issues) {
    const campo = String(problema.path[0] ?? "_");
    erros[campo] ??= problema.message;
  }
  return erros;
}

/** Copia os campos de texto do FormData (sem senhas) para devolver ao formulário. */
export function valoresDoFormulario(dados: FormData, multiplos: string[] = []): Record<string, string | string[]> {
  const valores: Record<string, string | string[]> = {};
  for (const [chave, valor] of dados.entries()) {
    if (typeof valor !== "string" || chave.startsWith("$") || chave.includes("senha")) continue;
    valores[chave] = multiplos.includes(chave) ? dados.getAll(chave).map(String) : valor;
  }
  return valores;
}

export function texto(dados: FormData, campo: string): string {
  const valor = dados.get(campo);
  return typeof valor === "string" ? valor : "";
}
