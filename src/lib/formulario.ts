import { z, type ZodError } from "zod";
import { conferirMunicipio } from "@/lib/municipios";

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

// Só Google Maps e Apple Maps: o botão "Ver no mapa" não pode levar a outro site.
function ehLinkDeMapa(url: URL): boolean {
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (["maps.app.goo.gl", "maps.apple.com", "maps.apple"].includes(host)) return true;
  if (/^maps\.google\.com(\.br)?$/.test(host)) return true;
  return (/^google\.com(\.br)?$/.test(host) || host === "goo.gl") && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"));
}

/** Link do mapa opcional: aceita links do Google Maps e do Apple Maps e guarda com https, ou null se vazio. */
export const campoMapa = z
  .string()
  .trim()
  .max(1000, "Link muito longo.")
  .transform((valor, ctx) => {
    if (!valor) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(valor) ? valor : `https://${valor}`);
      if (ehLinkDeMapa(url)) {
        url.protocol = "https:";
        const normalizada = url.toString();
        if (normalizada.length > 1000) {
          ctx.addIssue({ code: "custom", message: "Link muito longo." });
          return z.NEVER;
        }
        return normalizada;
      }
    } catch {
      // cai na mensagem abaixo
    }
    ctx.addIssue({ code: "custom", message: "Cole o link do Google Maps ou do Apple Maps (ex.: https://maps.app.goo.gl/...)." });
    return z.NEVER;
  });

/** Número do Brasil com DDD: "(11) 99148-8052" ou "+55 11 99148-8052" vira "5511991488052". Null se não for um. */
function numeroDoBrasil(valor: string): string | null {
  let digitos = valor.replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  // DDD sem zero, depois celular (9 + 8 dígitos) ou fixo (começa com 2 a 5).
  return /^55[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(digitos) ? digitos : null;
}

/** WhatsApp opcional: aceita "(11) 99148-8052" ou "+55 11 99148-8052" e guarda só os dígitos, com o 55. */
export const campoWhatsapp = z
  .string()
  .trim()
  .max(30)
  .transform((valor, ctx) => {
    if (!valor) return null;
    const digitos = numeroDoBrasil(valor);
    if (!digitos) {
      ctx.addIssue({ code: "custom", message: "Digite o número com DDD (ex.: 11 99148-8052)." });
      return z.NEVER;
    }
    return digitos;
  });

/** Telefone opcional, como o comercial do negócio: a mesma regra do WhatsApp. */
export const campoTelefoneOpcional = campoWhatsapp;

/** Telefone obrigatório da conta, guardado como o WhatsApp: só os dígitos, com o 55. */
export const campoTelefone = z
  .string()
  .trim()
  .max(30, "Telefone muito longo.")
  .transform((valor, ctx) => {
    const digitos = numeroDoBrasil(valor);
    if (!digitos) {
      ctx.addIssue({
        code: "custom",
        message: valor ? "Digite o telefone com DDD (ex.: 11 99148-8052)." : "Informe seu telefone com DDD.",
      });
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
