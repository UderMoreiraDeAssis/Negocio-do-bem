import "server-only";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { db, type Prisma } from "@/lib/db";
import { campoEmail, campoMunicipio, campoWhatsapp } from "@/lib/formulario";
import { temContatoOuPagamento } from "@/lib/ofertas";
import { normalizarTexto } from "@/lib/texto";
import { AREAS, CONTRATOS, MODALIDADES, type Area, type Contrato, type Modalidade } from "@/lib/vagas-rotulos";

// Banco de talentos (#347): o "aberto a trabalho" de quem procura emprego. Cada conta tem um
// perfil, que a pessoa liga e desliga sem apagar. A base é pública (nome, título, habilidades,
// o que procura e cidade), mas contato e currículo só chegam aos donos de negócios do
// diretório e à moderação.

export const MAXIMO_DE_HABILIDADES = 15;
export const TALENTOS_POR_PAGINA = 20;

const SEM_CONTATO = "Tire links, telefones, e-mails e Pix do texto. O contato vai nos campos de contato, que só os negócios veem.";

const texto = (minimo: number, maximo: number, rotulo: string) =>
  z
    .string()
    .trim()
    .min(minimo, `${rotulo}: escreva pelo menos ${minimo} caracteres.`)
    .max(maximo, `${rotulo}: use até ${maximo} caracteres.`)
    .refine((t) => !temContatoOuPagamento(t), SEM_CONTATO);

/** "Excel, atendimento; Confeitaria" vira ["Excel", "atendimento", "Confeitaria"], sem repetidas. */
export function separarHabilidades(valor: string): string[] {
  const vistas = new Set<string>();
  const habilidades: string[] = [];
  for (const parte of valor.split(/[,;\n]/)) {
    const habilidade = parte.trim().replace(/\s+/g, " ");
    const chave = normalizarTexto(habilidade);
    if (!habilidade || vistas.has(chave)) continue;
    vistas.add(chave);
    habilidades.push(habilidade);
  }
  return habilidades;
}

const campoHabilidades = z.string().transform((valor, ctx) => {
  const habilidades = separarHabilidades(valor);
  if (habilidades.length === 0) {
    ctx.addIssue({ code: "custom", message: "Escreva pelo menos uma habilidade, separadas por vírgula." });
    return z.NEVER;
  }
  if (habilidades.length > MAXIMO_DE_HABILIDADES) {
    ctx.addIssue({ code: "custom", message: `Escolha até ${MAXIMO_DE_HABILIDADES} habilidades.` });
    return z.NEVER;
  }
  if (habilidades.some((h) => h.length < 2 || h.length > 40)) {
    ctx.addIssue({ code: "custom", message: "Cada habilidade tem de 2 a 40 caracteres." });
    return z.NEVER;
  }
  if (habilidades.some(temContatoOuPagamento)) {
    ctx.addIssue({ code: "custom", message: SEM_CONTATO });
    return z.NEVER;
  }
  return habilidades;
});

/** Uma lista de chaves de um conjunto (caixas marcadas), com pelo menos uma. */
const escolhas = <T extends string>(conjunto: Record<T, string>, mensagem: string) =>
  z
    .array(z.string())
    .transform((valores) => [...new Set(valores)].filter((v): v is T => v in conjunto))
    .refine((valores) => valores.length > 0, mensagem);

const campoLink = z
  .string()
  .trim()
  .max(300, "Link muito longo.")
  .transform((valor, ctx) => {
    if (!valor) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(valor) ? valor : `https://${valor}`);
      if (!url.hostname.includes(".")) throw new Error();
      return url.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Digite um link válido (ex.: linkedin.com/in/seunome)." });
      return z.NEVER;
    }
  });

/** Os dados do perfil, conferidos. O currículo em arquivo é conferido à parte. */
export const esquemaDoTalento = z
  .object({
    nome: z.string().trim().min(3, "Escreva seu nome.").max(80, "Use até 80 caracteres."),
    titulo: texto(5, 100, "Título profissional"),
    sobre: texto(30, 1500, "Sobre você"),
    procura: texto(10, 500, "O que você procura"),
    habilidades: campoHabilidades,
    areas: escolhas(AREAS, "Marque pelo menos uma área."),
    contratos: escolhas(CONTRATOS, "Marque pelo menos um tipo de contratação."),
    modalidades: escolhas(MODALIDADES, "Marque pelo menos uma modalidade."),
    municipio: campoMunicipio,
    email: campoEmail.refine((e) => e !== null, "Digite o e-mail para os negócios falarem com você."),
    whatsapp: campoWhatsapp,
    link: campoLink,
    aberto: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
    consentimento: z.literal("sim", { message: "Autorize os negócios do diretório a ver seu contato e currículo." }),
  })
  .transform((t) => ({
    nome: t.nome,
    titulo: t.titulo,
    sobre: t.sobre,
    procura: t.procura,
    habilidades: t.habilidades,
    areas: t.areas as Area[],
    contratos: t.contratos as Contrato[],
    modalidades: t.modalidades as Modalidade[],
    cidade: t.municipio.nome,
    uf: t.municipio.uf,
    email: t.email!,
    whatsapp: t.whatsapp,
    link: t.link,
    aberto: t.aberto,
  }));
export type DadosDoTalento = z.output<typeof esquemaDoTalento>;

function textoDeBuscaDoTalento(t: Pick<DadosDoTalento, "nome" | "titulo" | "habilidades" | "procura" | "cidade" | "uf">): string {
  return normalizarTexto([t.nome, t.titulo, ...t.habilidades, t.procura, t.cidade, t.uf].join(" "));
}

/** O perfil que aparece na base: aberto a trabalho e não suspenso. */
export function condicaoDeTalentoPublico() {
  return { aberto: true, status: "ativo" } satisfies Prisma.TalentoWhereInput;
}

/**
 * Quem vê contato e currículo: a moderação e quem é dono de um negócio aprovado e fora do modo
 * oculto (os mesmos que podem publicar vagas).
 */
export async function podeVerContatosDeTalentos(usuario: { id: string; moderador: boolean } | null): Promise<boolean> {
  if (!usuario) return false;
  if (usuario.moderador) return true;
  const dono = await db.empresaMembro.findFirst({
    where: { usuarioId: usuario.id, empresa: { moderacao: "aprovada", oculta: false } },
    select: { usuarioId: true },
  });
  return dono !== null;
}

type Curriculo = { chave: string; nome: string };

/**
 * Cria ou atualiza o perfil da conta. `curriculo` troca o arquivo, `removerCurriculo` tira o
 * atual; sem os dois, o arquivo fica. Devolve a chave do arquivo antigo para quem chama apagar
 * depois que o banco já mudou.
 */
export async function salvarTalento(
  usuarioId: string,
  dados: DadosDoTalento,
  opcoes: { curriculo?: Curriculo | null; removerCurriculo?: boolean } = {},
): Promise<{ id: string; criado: boolean; curriculoAntigo: string | null }> {
  return db.$transaction(async (tx) => {
    const atual = await tx.talento.findUnique({ where: { usuarioId }, select: { id: true, curriculoChave: true } });
    const trocaArquivo = Boolean(opcoes.curriculo) || Boolean(opcoes.removerCurriculo);
    const arquivo = trocaArquivo ? { curriculoChave: opcoes.curriculo?.chave ?? null, curriculoNome: opcoes.curriculo?.nome ?? null } : {};
    const campos = { ...dados, busca: textoDeBuscaDoTalento(dados), ...arquivo };
    const salvo = await tx.talento.upsert({
      where: { usuarioId },
      create: { usuarioId, ...campos },
      update: campos,
      select: { id: true },
    });
    if (!atual) {
      await registrarAuditoria(tx, { usuarioId, acao: "talento.criado", alvoTipo: "usuario", alvoId: usuarioId, detalhes: dados.titulo });
    }
    return { id: salvo.id, criado: !atual, curriculoAntigo: trocaArquivo ? (atual?.curriculoChave ?? null) : null };
  });
}

/** Liga ou desliga o "aberto a trabalho". */
export async function alternarAberto(usuarioId: string, aberto: boolean): Promise<boolean> {
  const { count } = await db.talento.updateMany({ where: { usuarioId }, data: { aberto } });
  return count > 0;
}

/** A pessoa apaga o perfil. Devolve a chave do currículo para quem chama apagar o arquivo. */
export async function apagarTalento(usuarioId: string): Promise<{ curriculoChave: string | null } | null> {
  return db.$transaction(async (tx) => {
    const talento = await tx.talento.findUnique({ where: { usuarioId }, select: { id: true, curriculoChave: true } });
    if (!talento) return null;
    await tx.talento.delete({ where: { id: talento.id } });
    await registrarAuditoria(tx, { usuarioId, acao: "talento.apagado", alvoTipo: "usuario", alvoId: usuarioId });
    return { curriculoChave: talento.curriculoChave };
  });
}

/** A moderação tira o perfil da base, com o motivo, ou o devolve (`suspender = false`). */
export async function moderarTalento(talentoId: string, moderadorId: string, suspender: boolean, motivo: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const talento = await tx.talento.findUnique({ where: { id: talentoId }, select: { usuarioId: true, nome: true } });
    if (!talento) return false;
    const texto = motivo.trim().slice(0, 300);
    await tx.talento.update({
      where: { id: talentoId },
      data: suspender ? { status: "suspenso", motivo: texto || null } : { status: "ativo", motivo: null },
    });
    await registrarAuditoria(tx, {
      usuarioId: moderadorId,
      acao: suspender ? "talento.suspenso" : "talento.reativado",
      alvoTipo: "usuario",
      alvoId: talento.usuarioId,
      detalhes: `${talento.nome}${suspender && texto ? ` · ${texto}` : ""}`,
    });
    return true;
  });
}

// ─── Listagem ────────────────────────────────────────────────────────────────

export type FiltrosDeTalentos = { busca?: string; area?: string; contrato?: string; modalidade?: string; uf?: string };

const noConjunto = <T extends Record<string, string>>(conjunto: T, valor?: string) => (valor && valor in conjunto ? valor : undefined);

export function filtrosDeTalentosDaUrl(parametros: Record<string, string | string[] | undefined>): FiltrosDeTalentos {
  const um = (chave: string) => (typeof parametros[chave] === "string" ? (parametros[chave] as string).trim() : undefined);
  const uf = um("uf");
  return {
    busca: um("busca")?.slice(0, 80) || undefined,
    area: noConjunto(AREAS, um("area")),
    contrato: noConjunto(CONTRATOS, um("contrato")),
    modalidade: noConjunto(MODALIDADES, um("modalidade")),
    uf: uf && /^[A-Za-z]{2}$/.test(uf) ? uf.toUpperCase() : undefined,
  };
}

export function condicaoDeFiltrosDeTalentos(filtros: FiltrosDeTalentos): Prisma.TalentoWhereInput {
  const termo = filtros.busca ? normalizarTexto(filtros.busca) : "";
  return {
    ...condicaoDeTalentoPublico(),
    ...(filtros.area && { areas: { has: filtros.area } }),
    ...(filtros.contrato && { contratos: { has: filtros.contrato } }),
    ...(filtros.modalidade && { modalidades: { has: filtros.modalidade } }),
    ...(filtros.uf && { uf: filtros.uf }),
    ...(termo && { AND: termo.split(" ").map((palavra) => ({ busca: { contains: palavra } })) }),
  };
}
