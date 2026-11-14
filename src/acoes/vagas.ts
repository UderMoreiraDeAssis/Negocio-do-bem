"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { exigirModerador, exigirUsuario, usuarioAtual } from "@/lib/auth/sessao";
import { registrarAuditoria } from "@/lib/auditoria";
import { db } from "@/lib/db";
import { apagarDocumentosGuardados, conferirCurriculo, guardarDocumento } from "@/lib/documentos";
import { errosPorCampo, texto, valoresDoFormulario, type EstadoFormulario } from "@/lib/formulario";
import { avisarNovaCandidatura } from "@/lib/notificacoes";
import {
  candidatar,
  criarVaga,
  encerrarVaga,
  ErroCandidatura,
  ErroVaga,
  esquemaDaCandidatura,
  esquemaDaVaga,
  hojeEmBrasilia,
  moderarVaga,
} from "@/lib/vagas";

/** O dono publica a vaga do negócio, no painel. */
export async function criarVagaAcao(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const empresa = await db.empresa.findUnique({ where: { id: texto(dados, "empresaId") }, select: { id: true, instagramUsername: true } });
  if (!empresa) redirect("/painel");
  const usuario = await exigirUsuario(`/painel/${empresa.instagramUsername}/vagas`);
  const valores = valoresDoFormulario(dados);
  const resultado = esquemaDaVaga(hojeEmBrasilia()).safeParse({
    titulo: texto(dados, "titulo"),
    area: texto(dados, "area"),
    contrato: texto(dados, "contrato"),
    modalidade: texto(dados, "modalidade"),
    descricao: texto(dados, "descricao"),
    requisitos: texto(dados, "requisitos"),
    beneficios: texto(dados, "beneficios"),
    jornada: texto(dados, "jornada"),
    valorMin: texto(dados, "valorMin"),
    valorMax: texto(dados, "valorMax"),
    valorPeriodo: texto(dados, "valorPeriodo"),
    municipio: texto(dados, "municipio"),
    ultimoDia: texto(dados, "ultimoDia"),
    respeitaALei: texto(dados, "respeitaALei"),
  });
  if (!resultado.success) return { erros: errosPorCampo(resultado.error), valores };
  try {
    await criarVaga(empresa.id, usuario.id, resultado.data);
  } catch (erro) {
    if (erro instanceof ErroVaga) return { erro: erro.mensagem, valores };
    throw erro;
  }
  redirect(`/painel/${empresa.instagramUsername}/vagas?aviso=vaga_criada`);
}

/** Qualquer dono encerra a vaga. */
export async function encerrarVagaAcao(dados: FormData): Promise<void> {
  const usuario = await exigirUsuario("/painel");
  const username = await encerrarVaga(texto(dados, "vagaId"), usuario.id);
  if (!username) redirect("/painel");
  redirect(`/painel/${username}/vagas?aviso=vaga_encerrada`);
}

/** O dono marca a candidatura como vista. */
export async function marcarCandidaturaVistaAcao(dados: FormData): Promise<void> {
  const usuario = await exigirUsuario("/painel");
  const candidatura = await db.candidatura.findFirst({
    where: { id: texto(dados, "candidaturaId"), vaga: { empresa: { membros: { some: { usuarioId: usuario.id } } } } },
    select: { id: true, vaga: { select: { empresa: { select: { instagramUsername: true } } } } },
  });
  if (!candidatura) redirect("/painel");
  await db.candidatura.update({ where: { id: candidatura.id }, data: { vistaEm: new Date() } });
  redirect(`/painel/${candidatura.vaga.empresa.instagramUsername}/vagas#candidaturas`);
}

/** Quem procura trabalho se candidata. Não precisa de conta; o currículo vai para o bucket privado. */
export async function candidatarAcao(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const vagaId = texto(dados, "vagaId");
  const valores = valoresDoFormulario(dados);
  const resultado = esquemaDaCandidatura.safeParse({
    nome: texto(dados, "nome"),
    email: texto(dados, "email"),
    whatsapp: texto(dados, "whatsapp"),
    cidade: texto(dados, "cidade"),
    link: texto(dados, "link"),
    mensagem: texto(dados, "mensagem"),
    consentimento: texto(dados, "consentimento"),
  });
  if (!resultado.success) return { erros: errosPorCampo(resultado.error), valores };
  const arquivo = await conferirCurriculo(dados.get("curriculo"));
  if ("erro" in arquivo) return { erros: { curriculo: arquivo.erro }, valores };
  if (!arquivo.documento && !resultado.data.link) {
    return { erros: { curriculo: "Anexe o currículo ou informe o link dele ou do seu LinkedIn." }, valores };
  }

  const usuario = await usuarioAtual();
  const chave = arquivo.documento ? await guardarDocumento(arquivo.documento) : null;
  let criada: string;
  try {
    criada = await candidatar(
      vagaId,
      usuario?.id ?? null,
      resultado.data,
      chave && arquivo.documento ? { chave, nome: (arquivo.documento.arquivo.name || "curriculo").slice(0, 120) } : null,
    );
  } catch (erro) {
    if (chave) await apagarDocumentosGuardados([chave]);
    if (erro instanceof ErroCandidatura) {
      if (erro.motivo === "repetida") return { erro: "Você já se candidatou a esta vaga com este e-mail.", valores };
      if (erro.motivo === "lotada") return { erro: "Esta vaga já recebeu candidaturas demais e não aceita mais.", valores };
      if (erro.motivo === "sem_curriculo") return { erros: { curriculo: "Anexe o currículo ou informe um link." }, valores };
      redirect(`/vagas?aviso=vaga_indisponivel`);
    }
    throw erro;
  }
  after(() => avisarNovaCandidatura(criada));
  redirect(`/vagas/${vagaId}?aviso=candidatura_enviada`);
}

/** A moderação tira a vaga do ar ou a devolve. */
export async function moderarVagaAcao(dados: FormData): Promise<void> {
  const moderador = await exigirModerador("acao");
  const suspender = texto(dados, "acao") === "suspender";
  await moderarVaga(texto(dados, "vagaId"), moderador.id, suspender, texto(dados, "motivo"));
  redirect("/moderacao/vagas?aviso=vaga_moderada");
}

/** O dono apaga uma candidatura e o currículo dela (a pessoa pode pedir isso, e o dono não precisa guardar). */
export async function apagarCandidaturaAcao(dados: FormData): Promise<void> {
  const usuario = await exigirUsuario("/painel");
  const candidatura = await db.candidatura.findFirst({
    where: { id: texto(dados, "candidaturaId"), vaga: { empresa: { membros: { some: { usuarioId: usuario.id } } } } },
    select: { id: true, curriculoChave: true, vaga: { select: { empresaId: true, titulo: true, empresa: { select: { instagramUsername: true } } } } },
  });
  if (!candidatura) redirect("/painel");
  await db.$transaction(async (tx) => {
    await tx.candidatura.delete({ where: { id: candidatura.id } });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: "candidatura.apagada",
      alvoTipo: "empresa",
      alvoId: candidatura.vaga.empresaId,
      detalhes: `@${candidatura.vaga.empresa.instagramUsername} · ${candidatura.vaga.titulo}`,
    });
  });
  if (candidatura.curriculoChave) await apagarDocumentosGuardados([candidatura.curriculoChave]);
  redirect(`/painel/${candidatura.vaga.empresa.instagramUsername}/vagas?aviso=candidatura_apagada#candidaturas`);
}
