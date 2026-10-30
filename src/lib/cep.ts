import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { limparCep } from "@/lib/endereco";
import { nomeOficial } from "@/lib/municipios";
import { REGIOES_DF } from "@/lib/regioes-df";
import { normalizarTexto } from "@/lib/texto";

// Consulta de CEP no ViaCEP, só para ajudar a preencher o endereço. O ViaCEP é
// gratuito e avisa que uso massivo pode bloquear o acesso por tempo indeterminado,
// então cada consulta passa por esta ordem (decisões em docs/endereco.md):
// 1. CEP com formato válido, senão nem consulta;
// 2. cota por origem, que protege a nossa rota de uso automatizado;
// 3. cópia local ainda válida, que dispensa o ViaCEP;
// 4. pausa depois de falhas e cotas gerais, divididas entre as instâncias;
// 5. uma chamada só, sem repetição, unificando consultas iguais e simultâneas.
// Falha técnica nunca vira "CEP inexistente" e nunca é gravada na cópia local.

export const PROVEDOR = "viacep";

/** Consultas à nossa rota por origem (IP, ou /64 no IPv6) na janela abaixo. */
export const COTA_POR_ORIGEM = 20;
export const JANELA_ORIGEM_MS = 10 * 60 * 1000;
/** Chamadas ao ViaCEP somando todas as pessoas e instâncias. */
export const COTA_GERAL_POR_MINUTO = 20;
export const COTA_GERAL_POR_DIA = 1000;

/** CEP encontrado é usado sem nova consulta por 90 dias; depois disso, é revalidado no uso. */
export const REVALIDAR_APOS_MS = 90 * 24 * 60 * 60 * 1000;
/** Se o ViaCEP não responder, a cópia vale até 1 ano, mostrada como "a confirmar". */
export const IDADE_MAXIMA_MS = 365 * 24 * 60 * 60 * 1000;
/** "Não encontrado" vale pouco: o CEP pode ter sido criado depois. */
export const INEXISTENTE_VALE_MS = 7 * 24 * 60 * 60 * 1000;

export const TEMPO_LIMITE_MS = 4000;
/** Pausa depois de falhas seguidas: 1 min, dobrando até 1 h. O Retry-After vale até 24 h. */
export const PAUSA_INICIAL_MS = 60 * 1000;
export const PAUSA_MAXIMA_MS = 60 * 60 * 1000;
export const RETRY_AFTER_MAXIMO_MS = 24 * 60 * 60 * 1000;

const USER_AGENT = "NegocioDoBem/1.0 (+https://github.com/fabsreis/Negocio-do-bem)";

export type EnderecoDoCep = {
  cep: string;
  uf: string;
  /** Nome oficial do IBGE; null quando o ViaCEP traz uma cidade fora da lista. */
  cidade: string | null;
  bairro: string | null;
  logradouro: string | null;
  /** Só no DF, quando o bairro traz uma região da lista do GDF entre parênteses. */
  regiaoAdministrativa: string | null;
};

export type ResultadoCep =
  | { situacao: "encontrado"; endereco: EnderecoDoCep; aConfirmar: boolean }
  | { situacao: "inexistente" }
  | { situacao: "invalido" }
  | { situacao: "limite" }
  | { situacao: "indisponivel" }
  | { situacao: "desligada" };

type RespostaDoProvedor =
  | { tipo: "encontrado"; dados: DadosPostais }
  | { tipo: "inexistente" }
  | { tipo: "falha"; esperarMs?: number };

type DadosPostais = { uf: string; cidade: string | null; bairro: string | null; logradouro: string | null };

/** A consulta só funciona com CEP_CONSULTA=viacep. Sem isso, o endereço é preenchido à mão. */
export function consultaDeCepLigada(): boolean {
  return process.env.CEP_CONSULTA === PROVEDOR;
}

function texto(valor: unknown, maximo: number): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, maximo) : null;
}

/**
 * Interpreta a resposta do ViaCEP. CEP de formato válido que não existe vem com
 * status 200 e "erro": true (ou "true"). Qualquer coisa fora do esperado é falha,
 * nunca inexistência.
 */
export function interpretarViaCep(cep: string, corpo: unknown): RespostaDoProvedor {
  if (!corpo || typeof corpo !== "object") return { tipo: "falha" };
  const dados = corpo as Record<string, unknown>;
  if (dados.erro === true || dados.erro === "true") return { tipo: "inexistente" };
  const uf = texto(dados.uf, 2);
  if (limparCep(String(dados.cep ?? "")) !== cep || !uf || !/^[A-Z]{2}$/.test(uf)) return { tipo: "falha" };
  return {
    tipo: "encontrado",
    dados: { uf, cidade: texto(dados.localidade, 120), bairro: texto(dados.bairro, 100), logradouro: texto(dados.logradouro, 200) },
  };
}

/**
 * Retry-After em segundos ou como data HTTP, limitado a 24 h. Null quando ausente
 * ou ilegível: aí vale a pausa progressiva.
 */
export function lerRetryAfter(valor: string | null, agora = Date.now()): number | null {
  if (!valor) return null;
  const segundos = /^\d+$/.test(valor.trim()) ? Number(valor.trim()) * 1000 : Date.parse(valor) - agora;
  return Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos, RETRY_AFTER_MAXIMO_MS) : null;
}

/**
 * O endereço que o formulário recebe. No DF, os Correios põem a região
 * administrativa entre parênteses no bairro ("Ceilândia Sul (Ceilândia)"); ela vai
 * para o campo próprio só quando bate com a lista do GDF. A região nunca é deduzida
 * de "Brasília" sozinho.
 */
export function montarEndereco(cep: string, dados: DadosPostais): EnderecoDoCep {
  let bairro = dados.bairro;
  let regiaoAdministrativa: string | null = null;
  if (dados.uf === "DF" && bairro) {
    const entreParenteses = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(bairro);
    const candidata = entreParenteses ? entreParenteses[2]! : bairro;
    regiaoAdministrativa = REGIOES_DF.find((r) => normalizarTexto(r) === normalizarTexto(candidata)) ?? null;
    if (regiaoAdministrativa) bairro = entreParenteses ? entreParenteses[1]!.trim() || null : null;
  }
  return {
    cep,
    uf: dados.uf,
    cidade: dados.cidade ? nomeOficial(dados.cidade, dados.uf) : null,
    bairro,
    logradouro: dados.logradouro,
    regiaoAdministrativa,
  };
}

function chave(tipo: string, valor = ""): string {
  return createHash("sha256").update(`cep:${tipo}:${valor}`).digest("hex");
}

/** Soma uma unidade à janela atual, ou abre outra se a anterior venceu. Um comando só no banco. */
async function contar(chaveCota: string, janelaMs: number): Promise<number> {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - janelaMs);
  const [cota] = await db.$queryRaw<{ contagem: number }[]>`
    INSERT INTO "CotaCep" ("chave", "contagem", "janelaIniciadaEm")
    VALUES (${chaveCota}, 1, ${agora})
    ON CONFLICT ("chave") DO UPDATE SET
      "contagem" = CASE WHEN "CotaCep"."janelaIniciadaEm" >= ${inicio}
        THEN "CotaCep"."contagem" + 1 ELSE 1 END,
      "janelaIniciadaEm" = CASE WHEN "CotaCep"."janelaIniciadaEm" >= ${inicio}
        THEN "CotaCep"."janelaIniciadaEm" ELSE EXCLUDED."janelaIniciadaEm" END
    RETURNING "contagem"`;
  return cota!.contagem;
}

/** Sem IP confiável, as origens desconhecidas dividem uma cota só, como no login. */
async function origemLiberada(origem: string | null): Promise<boolean> {
  return (await contar(origem ? chave("origem", origem) : chave("origem-desconhecida"), JANELA_ORIGEM_MS)) <= COTA_POR_ORIGEM;
}

async function cotaGeralLiberada(): Promise<boolean> {
  await db.cotaCep.deleteMany({ where: { janelaIniciadaEm: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  // Conta as duas antes de decidir, para uma não ficar sem registro quando a outra estoura.
  const [porMinuto, porDia] = [await contar(chave("geral-minuto"), 60 * 1000), await contar(chave("geral-dia"), 24 * 60 * 60 * 1000)];
  return porMinuto <= COTA_GERAL_POR_MINUTO && porDia <= COTA_GERAL_POR_DIA;
}

async function provedorPausado(): Promise<boolean> {
  const pausa = await db.pausaProvedorCep.findUnique({ where: { provedor: PROVEDOR } });
  return !!pausa && pausa.pausadoAte > new Date();
}

/**
 * Pausa as chamadas depois de uma falha: o Retry-After, quando o ViaCEP manda, ou
 * 1 min dobrando a cada falha seguida, até 1 h, com até 20% a mais ao acaso para as
 * instâncias não voltarem todas juntas. Nunca encurta uma pausa já marcada.
 */
async function registrarFalha(esperarMs?: number): Promise<void> {
  const [registro] = await db.$queryRaw<{ falhasSeguidas: number }[]>`
    INSERT INTO "PausaProvedorCep" ("provedor", "falhasSeguidas", "pausadoAte")
    VALUES (${PROVEDOR}, 1, ${new Date()})
    ON CONFLICT ("provedor") DO UPDATE SET "falhasSeguidas" = "PausaProvedorCep"."falhasSeguidas" + 1
    RETURNING "falhasSeguidas"`;
  const progressiva = Math.min(PAUSA_INICIAL_MS * 2 ** Math.min(registro!.falhasSeguidas - 1, 10), PAUSA_MAXIMA_MS);
  const pausa = Math.max(esperarMs ?? 0, progressiva) * (1 + Math.random() * 0.2);
  const ate = new Date(Date.now() + pausa);
  await db.$executeRaw`
    UPDATE "PausaProvedorCep" SET "pausadoAte" = GREATEST("pausadoAte", ${ate}) WHERE "provedor" = ${PROVEDOR}`;
}

async function registrarSucesso(): Promise<void> {
  await db.pausaProvedorCep.deleteMany({ where: { provedor: PROVEDOR } });
}

/** Uma chamada, sem repetição: repetir só aumentaria a carga num serviço com problema. */
async function chamarViaCep(cep: string): Promise<RespostaDoProvedor> {
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      cache: "no-store",
      redirect: "error",
    });
    if (resposta.status === 429 || resposta.status === 503) {
      return { tipo: "falha", esperarMs: lerRetryAfter(resposta.headers.get("retry-after")) ?? undefined };
    }
    if (!resposta.ok) return { tipo: "falha" };
    return interpretarViaCep(cep, await resposta.json());
  } catch {
    return { tipo: "falha" };
  }
}

// Consultas iguais ao mesmo tempo na mesma instância esperam a mesma chamada.
const emAndamento = new Map<string, Promise<RespostaDoProvedor>>();

function consultarProvedor(cep: string): Promise<RespostaDoProvedor> {
  let consulta = emAndamento.get(cep);
  if (!consulta) {
    consulta = chamarViaCep(cep).finally(() => emAndamento.delete(cep));
    emAndamento.set(cep, consulta);
  }
  return consulta;
}

type Copia = Awaited<ReturnType<typeof db.cepConsultado.findUnique>>;

function enderecoDaCopia(copia: NonNullable<Copia>): EnderecoDoCep {
  return montarEndereco(copia.cep, { uf: copia.uf ?? "", cidade: copia.cidade, bairro: copia.bairro, logradouro: copia.logradouro });
}

/** Sem o ViaCEP, a última cópia encontrada ainda serve até a idade máxima, marcada como "a confirmar". */
function usarCopiaVencida(copia: Copia): ResultadoCep {
  if (copia?.situacao === "encontrado" && Date.now() - copia.consultadoEm.getTime() <= IDADE_MAXIMA_MS) {
    return { situacao: "encontrado", endereco: enderecoDaCopia(copia), aConfirmar: true };
  }
  return { situacao: "indisponivel" };
}

/**
 * Consulta um CEP para ajudar a preencher o endereço. `origem` é o IP já conferido
 * (ver ipDoCabecalho), ou null quando não há como saber.
 */
export async function consultarCep(valor: string, origem: string | null): Promise<ResultadoCep> {
  const cep = limparCep(valor);
  if (!cep) return { situacao: "invalido" };
  if (!consultaDeCepLigada()) return { situacao: "desligada" };
  if (!(await origemLiberada(origem))) return { situacao: "limite" };

  const copia = await db.cepConsultado.findUnique({ where: { cep } });
  if (copia) {
    const idade = Date.now() - copia.consultadoEm.getTime();
    if (copia.situacao === "encontrado" && idade <= REVALIDAR_APOS_MS) {
      return { situacao: "encontrado", endereco: enderecoDaCopia(copia), aConfirmar: false };
    }
    if (copia.situacao === "inexistente" && idade <= INEXISTENTE_VALE_MS) return { situacao: "inexistente" };
  }

  if ((await provedorPausado()) || !(await cotaGeralLiberada())) return usarCopiaVencida(copia);

  const resposta = await consultarProvedor(cep);
  if (resposta.tipo === "falha") {
    await registrarFalha(resposta.esperarMs);
    return usarCopiaVencida(copia);
  }

  await registrarSucesso();
  const consultadoEm = new Date();
  if (resposta.tipo === "inexistente") {
    const dados = { situacao: "inexistente", uf: null, cidade: null, bairro: null, logradouro: null, fonte: PROVEDOR, consultadoEm };
    await db.cepConsultado.upsert({ where: { cep }, create: { cep, ...dados }, update: dados });
    return { situacao: "inexistente" };
  }
  const dados = { situacao: "encontrado", ...resposta.dados, fonte: PROVEDOR, consultadoEm };
  await db.cepConsultado.upsert({ where: { cep }, create: { cep, ...dados }, update: dados });
  return { situacao: "encontrado", endereco: montarEndereco(cep, resposta.dados), aConfirmar: false };
}
