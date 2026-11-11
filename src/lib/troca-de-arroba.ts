// Troca do @ do Instagram de um negócio (#298). O @ é também o endereço da página,
// então o antigo fica guardado em EnderecoAntigo e redireciona para o atual.
//
// A moderação troca direto, na edição do perfil. O dono pede, e a troca só vale quando
// a moderação aprova (#299): ele pode ter assumido o perfil só com os dados do negócio,
// sem provar que controla o Instagram, e poria o @ de outro negócio que ainda não está
// no site.

import "server-only";
import { permanentRedirect, redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { db, type Prisma } from "@/lib/db";
import { rotuloDoInstagram } from "@/lib/endereco";
import { normalizarUsername } from "@/lib/instagram";
import { MOTIVO_ARROBA, suspenderPorContatoAlterado } from "@/lib/ofertas";
import { textoDeBusca } from "@/lib/texto";

export type ResultadoDaTroca = "trocado" | "mesmo" | "ocupado";

type EmpresaDaTroca = {
  id: string;
  instagramUsername: string;
  nome: string;
  resumo: string;
  categoria: string;
  cidade: string;
  uf: string;
};

/**
 * Troca o endereço do negócio para o @ `novo` (já normalizado). Recusa um @ que já é
 * de outro negócio. O endereço antigo passa a redirecionar para o novo; se o novo era
 * endereço antigo de algum negócio, deixa de ser. Troca feita pelo dono suspende o
 * Clube do Bem até a moderação conferir de novo, como a troca de contato.
 */
export async function trocarArroba(
  tx: Prisma.TransactionClient,
  empresa: EmpresaDaTroca,
  novo: string,
  quem: { usuarioId: string; pelaModeracao: boolean },
): Promise<ResultadoDaTroca> {
  const antigo = empresa.instagramUsername;
  if (novo === antigo) return "mesmo";
  const dono = await tx.empresa.findUnique({ where: { instagramUsername: novo }, select: { id: true } });
  if (dono) return "ocupado";

  await tx.enderecoAntigo.deleteMany({ where: { endereco: novo } });
  await tx.empresa.update({
    where: { id: empresa.id },
    // Os IDs fixos do Instagram eram da conta do @ antigo.
    data: {
      instagramUsername: novo,
      instagramUserId: null,
      instagramIgsid: null,
      busca: textoDeBusca({ ...empresa, instagramUsername: novo }),
    },
  });
  await tx.enderecoAntigo.upsert({
    where: { endereco: antigo },
    create: { endereco: antigo, empresaId: empresa.id },
    update: { empresaId: empresa.id },
  });
  await registrarAuditoria(tx, {
    usuarioId: quem.usuarioId,
    acao: quem.pelaModeracao ? "empresa.arroba_trocado_pela_moderacao" : "empresa.arroba_trocado",
    alvoTipo: "empresa",
    alvoId: empresa.id,
    detalhes: `${rotuloDoInstagram(antigo)} (${antigo}) → @${novo}`,
  });
  if (!quem.pelaModeracao) await suspenderPorContatoAlterado(tx, { id: empresa.id, instagramUsername: novo }, MOTIVO_ARROBA);
  return "trocado";
}

/** O endereço atual de um negócio que já usou `endereco`, ou null. */
export async function enderecoAtual(endereco: string): Promise<string | null> {
  const antigo = await db.enderecoAntigo.findUnique({
    where: { endereco },
    select: { empresa: { select: { instagramUsername: true } } },
  });
  return antigo?.empresa.instagramUsername ?? null;
}

/** Página aberta pelo endereço antigo: redireciona para o mesmo caminho com o endereço atual. */
export async function seguirEnderecoAntigo(endereco: string, caminho: (atual: string) => string, permanente = false): Promise<void> {
  const atual = await enderecoAtual(endereco);
  if (!atual) return;
  if (permanente) permanentRedirect(caminho(atual));
  redirect(caminho(atual));
}

// Pedido de troca do @ pelo dono (#299).

export type MotivoRecusaTroca =
  | "arroba_invalido"
  | "mesmo_arroba"
  | "arroba_em_uso"
  | "nao_e_dono"
  | "pedido_em_analise"
  | "ja_decidido"
  | "arroba_mudou";

export class ErroTroca extends Error {
  constructor(public motivo: MotivoRecusaTroca) {
    super(motivo);
  }
}

/** O @ já é de outro negócio? */
async function emUso(arroba: string, empresaId: string): Promise<boolean> {
  const dono = await db.empresa.findUnique({ where: { instagramUsername: arroba }, select: { id: true } });
  return Boolean(dono && dono.id !== empresaId);
}

/** O dono pede a troca do @. Devolve o @ pedido, já normalizado. */
export async function pedirTrocaDeArroba({
  empresaId,
  usuarioId,
  arroba,
}: {
  empresaId: string;
  usuarioId: string;
  arroba: string;
}): Promise<string> {
  const novo = normalizarUsername(arroba);
  if (!novo) throw new ErroTroca("arroba_invalido");
  const membro = await db.empresaMembro.findUnique({
    where: { empresaId_usuarioId: { empresaId, usuarioId } },
    include: { empresa: { select: { instagramUsername: true } } },
  });
  if (!membro) throw new ErroTroca("nao_e_dono");
  const atual = membro.empresa.instagramUsername;
  if (novo === atual) throw new ErroTroca("mesmo_arroba");
  if (await emUso(novo, empresaId)) throw new ErroTroca("arroba_em_uso");

  await db.$transaction(async (tx) => {
    // Trava o negócio: dois pedidos ao mesmo tempo esperam a vez, e só um entra.
    await tx.$queryRaw`SELECT id FROM "Empresa" WHERE id = ${empresaId} FOR NO KEY UPDATE`;
    const pendente = await tx.trocaDeArroba.count({ where: { empresaId, status: "pendente" } });
    if (pendente > 0) throw new ErroTroca("pedido_em_analise");
    await tx.trocaDeArroba.create({ data: { empresaId, usuarioId, arrobaAntigo: atual, arrobaNovo: novo } });
    await registrarAuditoria(tx, {
      usuarioId,
      acao: "empresa.arroba_pedido",
      alvoTipo: "empresa",
      alvoId: empresaId,
      detalhes: `@${atual} → @${novo}`,
    });
  });
  return novo;
}

/** O dono desiste do pedido em análise. Devolve se havia um para cancelar. */
export async function cancelarTrocaDeArroba({ empresaId, usuarioId }: { empresaId: string; usuarioId: string }): Promise<boolean> {
  const membro = await db.empresaMembro.findUnique({ where: { empresaId_usuarioId: { empresaId, usuarioId } } });
  if (!membro) throw new ErroTroca("nao_e_dono");
  const { count } = await db.trocaDeArroba.updateMany({
    where: { empresaId, status: "pendente" },
    data: { status: "cancelada", decididoEm: new Date() },
  });
  return count > 0;
}

type Decisao = { empresaId: string; usuarioId: string; arrobaNovo: string };

/**
 * A moderação aprova: a troca segue `trocarArroba`, como uma troca da moderação (o
 * endereço antigo passa a levar ao novo, sem suspender o Clube do Bem). Recusa se o
 * pedido já foi decidido, se o @ do negócio mudou depois do pedido ou se o @ novo foi
 * ocupado por outro negócio enquanto isso; nesses casos o pedido fica na fila.
 */
export async function aprovarTrocaDeArroba({ trocaId, moderadorId }: { trocaId: string; moderadorId: string }): Promise<Decisao> {
  try {
    return await aprovar(trocaId, moderadorId);
  } catch (erro) {
    // Outro negócio pegou o @ entre a conferência e a troca.
    if ((erro as { code?: string }).code === "P2002") throw new ErroTroca("arroba_em_uso");
    throw erro;
  }
}

function aprovar(trocaId: string, moderadorId: string): Promise<Decisao> {
  return db.$transaction(async (tx) => {
    const troca = await tx.trocaDeArroba.findUnique({ where: { id: trocaId }, select: { empresaId: true } });
    if (!troca) throw new ErroTroca("ja_decidido");
    await tx.$queryRaw`SELECT id FROM "Empresa" WHERE id = ${troca.empresaId} FOR NO KEY UPDATE`;
    const [pedido, empresa] = await Promise.all([
      tx.trocaDeArroba.findUniqueOrThrow({ where: { id: trocaId } }),
      tx.empresa.findUniqueOrThrow({ where: { id: troca.empresaId } }),
    ]);
    if (pedido.status !== "pendente") throw new ErroTroca("ja_decidido");
    if (empresa.instagramUsername !== pedido.arrobaAntigo) throw new ErroTroca("arroba_mudou");

    const resultado = await trocarArroba(tx, empresa, pedido.arrobaNovo, { usuarioId: moderadorId, pelaModeracao: true });
    if (resultado !== "trocado") throw new ErroTroca("arroba_em_uso");
    await tx.trocaDeArroba.update({
      where: { id: trocaId },
      data: { status: "aprovada", decididoPorId: moderadorId, decididoEm: new Date() },
    });
    return { empresaId: empresa.id, usuarioId: pedido.usuarioId, arrobaNovo: pedido.arrobaNovo };
  });
}

/** A moderação recusa, com o motivo, que o dono vê no painel e no e-mail. */
export async function recusarTrocaDeArroba({
  trocaId,
  moderadorId,
  motivo,
}: {
  trocaId: string;
  moderadorId: string;
  motivo: string;
}): Promise<Decisao> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.trocaDeArroba.updateMany({
      where: { id: trocaId, status: "pendente" },
      data: { status: "recusada", motivo, decididoPorId: moderadorId, decididoEm: new Date() },
    });
    if (count === 0) throw new ErroTroca("ja_decidido");
    const troca = await tx.trocaDeArroba.findUniqueOrThrow({ where: { id: trocaId } });
    await registrarAuditoria(tx, {
      usuarioId: moderadorId,
      acao: "empresa.arroba_recusado",
      alvoTipo: "empresa",
      alvoId: troca.empresaId,
      detalhes: `@${troca.arrobaAntigo} → @${troca.arrobaNovo} · ${motivo}`,
    });
    return { empresaId: troca.empresaId, usuarioId: troca.usuarioId, arrobaNovo: troca.arrobaNovo };
  });
}

/** O último pedido do negócio, para o painel do dono mostrar o que está em análise ou a última recusa. */
export function ultimaTrocaDeArroba(empresaId: string) {
  return db.trocaDeArroba.findFirst({
    where: { empresaId },
    orderBy: { criadoEm: "desc" },
    select: { status: true, arrobaNovo: true, motivo: true, criadoEm: true },
  });
}
