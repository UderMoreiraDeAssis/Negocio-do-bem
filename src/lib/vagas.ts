import "server-only";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { db, type Prisma } from "@/lib/db";
import { fimDoDia, hojeEmBrasilia, somarDias, temContatoOuPagamento } from "@/lib/ofertas";
import { campoEmail, campoMunicipio, campoWhatsapp } from "@/lib/formulario";
import { normalizarTexto } from "@/lib/texto";

// Vagas (#339). Um dono de negócio aprovado no diretório divulga a vaga, que vai ao ar na
// hora; a moderação pode suspender. Quem se candidata não precisa de conta: os dados e o
// currículo vão só para os donos do negócio e para a moderação.

export { AREAS, CONTRATOS, MODALIDADES, PERIODOS } from "@/lib/vagas-rotulos";
export type { Area, Contrato, Modalidade, Periodo } from "@/lib/vagas-rotulos";
import { AREAS, CONTRATOS, MODALIDADES, PERIODOS, type Area, type Contrato, type Modalidade, type Periodo } from "@/lib/vagas-rotulos";

export const DIAS_MAXIMOS = 60;
export const DIAS_PADRAO = 30;
export const MAXIMO_DE_VAGAS_ABERTAS = 10;
export const MAXIMO_DE_CANDIDATURAS = 500;
export const VALOR_MAXIMO = 1_000_000;

const SEM_CONTATO = "Tire links, telefones, e-mails, documentos e Pix do texto. As candidaturas chegam pela plataforma.";
// A seleção é por competência: exigir sexo, idade ou "boa aparência" não passa.
const DISCRIMINA =
  /\b(boa apar[eê]ncia|(apenas|somente|s[oó]) (homens?|mulheres?|brancos?|jovens)|sexo (masculino|feminino)|(at[eé]|m[aá]xim[oa] de) \d{2} anos|idade (m[aá]xima|entre|at[eé])|sem filhos|n[aã]o (ter|tenha) filhos)\b/i;
const SEM_DISCRIMINACAO = "A seleção é por competência: tire exigências de sexo, idade, aparência ou filhos do texto.";

const texto = (minimo: number, maximo: number, rotulo: string) =>
  z
    .string()
    .trim()
    .min(minimo, `${rotulo}: escreva pelo menos ${minimo} caracteres.`)
    .max(maximo, `${rotulo}: use até ${maximo} caracteres.`)
    .refine((t) => !temContatoOuPagamento(t), SEM_CONTATO)
    .refine((t) => !DISCRIMINA.test(t), SEM_DISCRIMINACAO);

const reais = z.string().trim();

/** Os dados da vaga, conferidos. `hoje` é o dia de Brasília em que ela é criada. */
export function esquemaDaVaga(hoje: string) {
  return z
    .object({
      titulo: texto(5, 80, "Cargo ou serviço"),
      area: z.enum(Object.keys(AREAS) as [Area, ...Area[]], { message: "Escolha a área." }),
      contrato: z.enum(Object.keys(CONTRATOS) as [Contrato, ...Contrato[]], { message: "Escolha o tipo de contratação." }),
      modalidade: z.enum(Object.keys(MODALIDADES) as [Modalidade, ...Modalidade[]], { message: "Escolha a modalidade." }),
      descricao: texto(30, 2000, "O que a pessoa vai fazer"),
      requisitos: texto(10, 1500, "Requisitos"),
      beneficios: texto(0, 500, "Benefícios"),
      jornada: texto(3, 100, "Jornada ou prazo"),
      valorMin: reais,
      valorMax: reais,
      valorPeriodo: z.enum(Object.keys(PERIODOS) as [Periodo, ...Periodo[]], { message: "Escolha o período do valor." }),
      municipio: campoMunicipio,
      ultimoDia: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha o último dia para se candidatar.")
        .refine((dia) => dia >= hoje, "O último dia não pode ser antes de hoje.")
        .refine((dia) => dia <= somarDias(hoje, DIAS_MAXIMOS - 1), `A vaga fica no ar por no máximo ${DIAS_MAXIMOS} dias.`),
      respeitaALei: z.literal("sim", { message: "Confirme o compromisso com a lei e com a seleção sem discriminação." }),
    })
    .superRefine((vaga, contexto) => {
      const minimo = Number(vaga.valorMin);
      if (!Number.isInteger(minimo) || minimo < 1 || minimo > VALOR_MAXIMO) {
        contexto.addIssue({ code: "custom", path: ["valorMin"], message: "Informe o valor em reais, a partir de R$ 1. Toda vaga mostra o valor." });
      }
      if (vaga.valorMax) {
        const maximo = Number(vaga.valorMax);
        if (!Number.isInteger(maximo) || maximo < minimo || maximo > VALOR_MAXIMO) {
          contexto.addIssue({ code: "custom", path: ["valorMax"], message: "O valor máximo não pode ser menor que o mínimo." });
        }
      }
    })
    .transform((vaga) => ({
      titulo: vaga.titulo,
      area: vaga.area,
      contrato: vaga.contrato,
      modalidade: vaga.modalidade,
      descricao: vaga.descricao,
      requisitos: vaga.requisitos,
      beneficios: vaga.beneficios || null,
      jornada: vaga.jornada,
      valorMin: Number(vaga.valorMin),
      valorMax: vaga.valorMax ? Number(vaga.valorMax) : null,
      valorPeriodo: vaga.valorPeriodo,
      cidade: vaga.municipio.nome,
      uf: vaga.municipio.uf,
      prazo: fimDoDia(vaga.ultimoDia),
    }));
}
export type DadosVaga = z.output<ReturnType<typeof esquemaDaVaga>>;

/** "R$ 2.000 a R$ 2.500 por mês". */
export function rotuloDoValor(vaga: { valorMin: number; valorMax: number | null; valorPeriodo: string }): string {
  const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;
  const faixa = vaga.valorMax && vaga.valorMax !== vaga.valorMin ? `${reais(vaga.valorMin)} a ${reais(vaga.valorMax)}` : reais(vaga.valorMin);
  return `${faixa} ${PERIODOS[vaga.valorPeriodo as Periodo] ?? ""}`.trim();
}

/** A vaga que o público vê: aberta, dentro do prazo, num negócio aprovado e fora do modo oculto. */
export function condicaoDeVagaPublica(agora = new Date()) {
  return { status: "aberta", prazo: { gt: agora }, empresa: { moderacao: "aprovada", oculta: false } } satisfies Prisma.VagaWhereInput;
}

export class ErroVaga extends Error {
  constructor(readonly mensagem: string) {
    super(mensagem);
  }
}

/** Publica a vaga. Só um dono, num negócio do diretório, com até 10 vagas abertas por vez. */
export async function criarVaga(empresaId: string, usuarioId: string, vaga: DadosVaga): Promise<string> {
  return db.$transaction(async (tx) => {
    // Trava o negócio: com dois envios ao mesmo tempo, o segundo vê a vaga do primeiro.
    const [empresa] = await tx.$queryRaw<{ instagramUsername: string; moderacao: string; oculta: boolean }[]>`
      SELECT "instagramUsername", moderacao, oculta FROM "Empresa" WHERE id = ${empresaId} FOR UPDATE`;
    const dono = await tx.empresaMembro.findFirst({ where: { empresaId, usuarioId }, select: { usuarioId: true } });
    if (!empresa || !dono) throw new ErroVaga("Só quem é dono do negócio publica vagas.");
    if (empresa.moderacao !== "aprovada" || empresa.oculta) throw new ErroVaga("Seu negócio precisa estar no diretório para divulgar vagas.");
    if ((await tx.vaga.count({ where: { empresaId, status: "aberta", prazo: { gt: new Date() } } })) >= MAXIMO_DE_VAGAS_ABERTAS) {
      throw new ErroVaga(`Seu negócio já tem ${MAXIMO_DE_VAGAS_ABERTAS} vagas abertas. Encerre uma para publicar outra.`);
    }
    const criada = await tx.vaga.create({ data: { empresaId, criadaPorId: usuarioId, ...vaga } });
    await registrarAuditoria(tx, {
      usuarioId,
      acao: "vaga.criada",
      alvoTipo: "empresa",
      alvoId: empresaId,
      detalhes: `@${empresa.instagramUsername} · ${vaga.titulo}`,
    });
    return criada.id;
  });
}

/** Qualquer dono encerra a vaga. Devolve o @ do negócio, ou null se a pessoa não é dona. */
export async function encerrarVaga(vagaId: string, usuarioId: string): Promise<string | null> {
  return db.$transaction(async (tx) => {
    const vaga = await tx.vaga.findUnique({
      where: { id: vagaId },
      include: { empresa: { select: { instagramUsername: true, membros: { where: { usuarioId }, select: { usuarioId: true } } } } },
    });
    if (!vaga || vaga.empresa.membros.length === 0) return null;
    const { count } = await tx.vaga.updateMany({ where: { id: vagaId, status: "aberta" }, data: { status: "encerrada" } });
    if (count > 0) {
      await registrarAuditoria(tx, {
        usuarioId,
        acao: "vaga.encerrada",
        alvoTipo: "empresa",
        alvoId: vaga.empresaId,
        detalhes: `@${vaga.empresa.instagramUsername} · ${vaga.titulo}`,
      });
    }
    return vaga.empresa.instagramUsername;
  });
}

/** A moderação tira a vaga do ar, com o motivo, ou a devolve (`suspender = false`). */
export async function moderarVaga(vagaId: string, moderadorId: string, suspender: boolean, motivo: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const vaga = await tx.vaga.findUnique({ where: { id: vagaId }, include: { empresa: { select: { instagramUsername: true } } } });
    if (!vaga) return false;
    await tx.vaga.update({
      where: { id: vagaId },
      data: suspender ? { status: "suspensa", motivo: motivo.trim().slice(0, 300) || null } : { status: "aberta", motivo: null },
    });
    await registrarAuditoria(tx, {
      usuarioId: moderadorId,
      acao: suspender ? "vaga.suspensa" : "vaga.reativada",
      alvoTipo: "empresa",
      alvoId: vaga.empresaId,
      detalhes: `@${vaga.empresa.instagramUsername} · ${vaga.titulo}${suspender && motivo ? ` · ${motivo.trim().slice(0, 300)}` : ""}`,
    });
    return true;
  });
}

// ─── Listagem ────────────────────────────────────────────────────────────────

export type FiltrosDeVagas = { busca?: string; area?: string; contrato?: string; modalidade?: string; uf?: string };

const noConjunto = <T extends Record<string, string>>(conjunto: T, valor?: string) => (valor && valor in conjunto ? valor : undefined);

export function filtrosDaUrl(parametros: Record<string, string | string[] | undefined>): FiltrosDeVagas {
  const um = (chave: string) => (typeof parametros[chave] === "string" ? (parametros[chave] as string).trim() : undefined);
  return {
    busca: um("busca")?.slice(0, 80) || undefined,
    area: noConjunto(AREAS, um("area")),
    contrato: noConjunto(CONTRATOS, um("contrato")),
    modalidade: noConjunto(MODALIDADES, um("modalidade")),
    uf: um("uf") && /^[A-Za-z]{2}$/.test(um("uf")!) ? um("uf")!.toUpperCase() : undefined,
  };
}

export function condicaoDeFiltros(filtros: FiltrosDeVagas, agora = new Date()): Prisma.VagaWhereInput {
  const termo = filtros.busca ? normalizarTexto(filtros.busca) : "";
  return {
    ...condicaoDeVagaPublica(agora),
    ...(filtros.area && { area: filtros.area }),
    ...(filtros.contrato && { contrato: filtros.contrato }),
    ...(filtros.modalidade && { modalidade: filtros.modalidade }),
    ...(filtros.uf && { uf: filtros.uf }),
    ...(termo && {
      OR: [
        { titulo: { contains: filtros.busca, mode: "insensitive" } },
        { cidade: { contains: filtros.busca, mode: "insensitive" } },
        { empresa: { busca: { contains: termo } } },
      ],
    }),
  };
}

export const VAGAS_POR_PAGINA = 20;

// ─── Candidatura ─────────────────────────────────────────────────────────────

export const TAMANHO_MAXIMO_CURRICULO = 5 * 1024 * 1024;

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

/** Os dados da candidatura. O currículo (arquivo ou link) é conferido à parte, junto com o arquivo. */
export const esquemaDaCandidatura = z.object({
  nome: z.string().trim().min(3, "Escreva seu nome completo.").max(120, "Use até 120 caracteres."),
  email: campoEmail.refine((e) => e !== null, "Digite seu e-mail."),
  whatsapp: campoWhatsapp,
  cidade: z.string().trim().max(80, "Use até 80 caracteres."),
  link: campoLink,
  mensagem: z.string().trim().max(1000, "Use até 1000 caracteres."),
  consentimento: z.literal("sim", { message: "Autorize o envio dos seus dados para a empresa." }),
});
export type DadosDaCandidatura = z.output<typeof esquemaDaCandidatura>;

export class ErroCandidatura extends Error {
  constructor(readonly motivo: "indisponivel" | "repetida" | "lotada" | "sem_curriculo") {
    super(motivo);
  }
}

/**
 * Registra a candidatura. Uma por e-mail em cada vaga. `curriculoChave` já está guardado no
 * bucket privado; se o registro falhar, quem chama apaga o arquivo.
 */
export async function candidatar(
  vagaId: string,
  usuarioId: string | null,
  dados: DadosDaCandidatura,
  curriculo: { chave: string; nome: string } | null,
): Promise<string> {
  if (!curriculo && !dados.link) throw new ErroCandidatura("sem_curriculo");
  return db.$transaction(async (tx) => {
    const [vaga] = await tx.$queryRaw<{ id: string }[]>`
      SELECT v.id FROM "Vaga" v JOIN "Empresa" e ON e.id = v."empresaId"
      WHERE v.id = ${vagaId} AND v.status = 'aberta' AND v.prazo > now() AND e.moderacao = 'aprovada' AND e.oculta = false
      FOR UPDATE OF v`;
    if (!vaga) throw new ErroCandidatura("indisponivel");
    if (await tx.candidatura.count({ where: { vagaId, email: dados.email! } })) throw new ErroCandidatura("repetida");
    if ((await tx.candidatura.count({ where: { vagaId } })) >= MAXIMO_DE_CANDIDATURAS) throw new ErroCandidatura("lotada");
    const criada = await tx.candidatura.create({
      data: {
        vagaId,
        usuarioId,
        nome: dados.nome,
        email: dados.email!,
        whatsapp: dados.whatsapp,
        cidade: dados.cidade || null,
        link: dados.link,
        mensagem: dados.mensagem || null,
        curriculoChave: curriculo?.chave ?? null,
        curriculoNome: curriculo?.nome ?? null,
      },
    });
    return criada.id;
  });
}

export { hojeEmBrasilia, somarDias };
