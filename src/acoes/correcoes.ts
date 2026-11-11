"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirModerador, exigirUsuario } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { errosPorCampo, texto, valoresDoFormulario, type EstadoFormulario } from "@/lib/formulario";

const esquemaAviso = z.object({
  problema: z.string().trim().min(10, "Conte o que está errado.").max(1000, "Use até 1.000 caracteres."),
  correcao: z.string().trim().min(2, "Informe o dado certo ou peça a remoção do dado errado.").max(1000, "Use até 1.000 caracteres."),
  fonte: z.string().trim().max(1000, "Use um link de até 1.000 caracteres.").refine((valor) => {
    if (!valor) return true;
    try {
      const url = new URL(valor);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use um link completo, começando por https://.").transform((valor) => valor || null),
});

/** Um aviso não altera o perfil: a moderação confere e edita os dados pela tela existente. */
export async function avisarCorrecao(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirUsuario("/explorar");
  const valores = valoresDoFormulario(dados);
  const resultado = esquemaAviso.safeParse({
    problema: texto(dados, "problema"), correcao: texto(dados, "correcao"), fonte: texto(dados, "fonte"),
  });
  if (!resultado.success) return { erros: errosPorCampo(resultado.error), valores };

  const envio = await db.$transaction(async (tx) => {
    // Mesma trava da cota de indicações: envios simultâneos da conta esperam a vez.
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuario.id} FOR NO KEY UPDATE`;
    const empresa = await tx.empresa.findFirst({
      where: { id: texto(dados, "empresaId"), moderacao: "aprovada", oculta: false, membros: { none: {} } },
      select: { id: true, instagramUsername: true },
    });
    if (!empresa) return { erro: "Este perfil não está disponível para avisos de correção." };
    const recentes = await tx.correcaoPerfil.count({
      where: { autorId: usuario.id, criadoEm: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recentes >= 10) return { erro: "Você já enviou 10 avisos nas últimas 24 horas. Tente de novo amanhã." };
    const aviso = await tx.correcaoPerfil.create({
      data: { ...resultado.data, empresaId: empresa.id, autorId: usuario.id },
    });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id, acao: "correcao.enviada", alvoTipo: "empresa", alvoId: empresa.id, detalhes: `Aviso ${aviso.id}`,
    });
    return { endereco: empresa.instagramUsername };
  });
  if ("erro" in envio) return { erro: envio.erro, valores };
  redirect(`/empresas/${envio.endereco}?aviso=correcao_enviada`);
}

export async function decidirCorrecao(dados: FormData): Promise<void> {
  const moderador = await exigirModerador("acao");
  const decisao = texto(dados, "decisao");
  if (decisao !== "corrigido" && decisao !== "sem_mudanca") redirect("/moderacao?aba=correcoes");
  const decidida = await db.$transaction(async (tx) => {
    const id = texto(dados, "correcaoId");
    const { count } = await tx.correcaoPerfil.updateMany({
      where: { id, status: "pendente" },
      data: { status: decisao, revisadoPorId: moderador.id, revisadoEm: new Date() },
    });
    if (!count) return false;
    const aviso = await tx.correcaoPerfil.findUniqueOrThrow({ where: { id } });
    await registrarAuditoria(tx, {
      usuarioId: moderador.id, acao: `correcao.${decisao}`, alvoTipo: "empresa", alvoId: aviso.empresaId, detalhes: `Aviso ${id}`,
    });
    return true;
  });
  redirect(`/moderacao?aba=correcoes&aviso=${decidida ? "feito" : "ja_processada"}`);
}

/** Só a moderação edita ou apaga o motivo enviado por quem indicou. */
export async function editarMotivoIndicacao(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const moderador = await exigirModerador("acao");
  const valores = valoresDoFormulario(dados);
  const resultado = z.string().trim().max(600, "Use até 600 caracteres.").safeParse(texto(dados, "motivo"));
  if (!resultado.success) return { erros: { motivo: "Use até 600 caracteres." }, valores };
  const empresa = await db.$transaction(async (tx) => {
    const existente = await tx.empresa.findUnique({ where: { id: texto(dados, "empresaId") }, select: { id: true } });
    if (!existente) return null;
    const atualizada = await tx.empresa.update({
      where: { id: existente.id }, data: { motivoIndicacao: resultado.data || null },
    });
    await registrarAuditoria(tx, {
      usuarioId: moderador.id, acao: "empresa.motivo_editado", alvoTipo: "empresa", alvoId: atualizada.id,
    });
    return atualizada;
  });
  if (!empresa) redirect("/moderacao?aba=negocios");
  redirect(`/moderacao/negocios/${empresa.instagramUsername}?aviso=salvo`);
}
