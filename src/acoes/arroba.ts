"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { exigirModerador, exigirUsuario } from "@/lib/auth/sessao";
import { AVISOS } from "@/lib/avisos";
import { db } from "@/lib/db";
import { texto, type EstadoFormulario } from "@/lib/formulario";
import { gravarFotoDaPrevia } from "@/lib/fotos-instagram";
import { hrefModeracao } from "@/lib/moderacao/filtros";
import { avisarDecisaoDaTrocaDeArroba, avisarNovaTrocaDeArroba } from "@/lib/notificacoes";
import {
  aprovarTrocaDeArroba,
  cancelarTrocaDeArroba,
  ErroTroca,
  pedirTrocaDeArroba,
  recusarTrocaDeArroba,
  type MotivoRecusaTroca,
} from "@/lib/troca-de-arroba";

// O texto que o dono vê quando o pedido não entra.
const ERROS_DO_PEDIDO: Record<MotivoRecusaTroca, string> = {
  arroba_invalido: "Digite o @ do Instagram do negócio (ex.: @padariadobairro).",
  mesmo_arroba: "Este já é o @ do seu negócio.",
  arroba_em_uso: "Este @ já é de outro negócio do Negócio do Bem. Se ele é seu, fale com a moderação.",
  nao_e_dono: "Só um dono do negócio pode pedir a troca do @.",
  pedido_em_analise: "Já existe um pedido de troca do @ em análise para este negócio.",
  ja_decidido: "Este pedido já foi decidido.",
  arroba_mudou: "O @ do negócio mudou depois do pedido.",
};

/** O dono pede a troca do @ do negócio. O pedido vai para a fila da moderação. */
export async function pedirTrocaDeArrobaAcao(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const empresa = await db.empresa.findUnique({ where: { id: texto(dados, "empresaId") }, select: { id: true, instagramUsername: true } });
  if (!empresa) redirect("/painel");
  const painel = `/painel/${empresa.instagramUsername}`;
  const usuario = await exigirUsuario(painel);
  const valores = { arroba: texto(dados, "arroba") };
  if (!usuario.emailConfirmado) return { erro: AVISOS.confirmar_email.texto, valores };
  try {
    await pedirTrocaDeArroba({ empresaId: empresa.id, usuarioId: usuario.id, arroba: valores.arroba });
  } catch (erro) {
    if (erro instanceof ErroTroca) return { erros: { arroba: ERROS_DO_PEDIDO[erro.motivo] }, valores };
    throw erro;
  }
  after(() => avisarNovaTrocaDeArroba(empresa.id));
  redirect(`${painel}?aviso=arroba_pedido_enviado#arroba`);
}

/** O dono desiste do pedido em análise. */
export async function cancelarTrocaDeArrobaAcao(dados: FormData): Promise<void> {
  const empresa = await db.empresa.findUnique({ where: { id: texto(dados, "empresaId") }, select: { id: true, instagramUsername: true } });
  if (!empresa) redirect("/painel");
  const painel = `/painel/${empresa.instagramUsername}`;
  const usuario = await exigirUsuario(painel);
  try {
    await cancelarTrocaDeArroba({ empresaId: empresa.id, usuarioId: usuario.id });
  } catch (erro) {
    if (erro instanceof ErroTroca) redirect("/painel");
    throw erro;
  }
  redirect(`${painel}?aviso=arroba_pedido_cancelado#arroba`);
}

function voltarParaAFila(aviso: string): never {
  redirect(`${hrefModeracao("arroba", { aviso })}#pedidos`);
}

/** A moderação aprova a troca: o @ e o endereço da página mudam. Só a moderação. */
export async function aprovarTrocaDeArrobaAcao(dados: FormData): Promise<void> {
  const moderador = await exigirModerador("acao");
  let decisao;
  try {
    decisao = await aprovarTrocaDeArroba({ trocaId: texto(dados, "trocaId"), moderadorId: moderador.id });
  } catch (erro) {
    if (erro instanceof ErroTroca) voltarParaAFila(`arroba_${erro.motivo}`);
    throw erro;
  }
  const { empresaId, usuarioId, arrobaNovo } = decisao;
  after(async () => {
    await avisarDecisaoDaTrocaDeArroba(empresaId, usuarioId);
    // Sem foto, o negócio ganha a do @ novo; uma foto enviada pelo dono nunca é trocada.
    await gravarFotoDaPrevia(empresaId, arrobaNovo);
  });
  voltarParaAFila("arroba_aprovado");
}

/** A moderação recusa a troca, com o motivo, que o dono vê. Só a moderação. */
export async function recusarTrocaDeArrobaAcao(dados: FormData): Promise<void> {
  const moderador = await exigirModerador("acao");
  const motivo = texto(dados, "motivo").trim().slice(0, 500) || "Sem motivo informado";
  let decisao;
  try {
    decisao = await recusarTrocaDeArroba({ trocaId: texto(dados, "trocaId"), moderadorId: moderador.id, motivo });
  } catch (erro) {
    if (erro instanceof ErroTroca) voltarParaAFila(`arroba_${erro.motivo}`);
    throw erro;
  }
  const { empresaId, usuarioId } = decisao;
  after(() => avisarDecisaoDaTrocaDeArroba(empresaId, usuarioId));
  voltarParaAFila("arroba_recusado");
}
