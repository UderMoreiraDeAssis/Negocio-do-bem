"use server";

import { redirect } from "next/navigation";
import { exigirModerador, exigirUsuario } from "@/lib/auth/sessao";
import { AVISOS } from "@/lib/avisos";
import { apagarDocumentosGuardados, conferirCurriculo, guardarDocumento } from "@/lib/documentos";
import { errosPorCampo, texto, valoresDoFormulario, type EstadoFormulario } from "@/lib/formulario";
import { alternarAberto, apagarTalento, esquemaDoTalento, moderarTalento, salvarTalento } from "@/lib/talentos";

const MEU_PERFIL = "/vagas/talentos/meu-perfil";
const MULTIPLOS = ["areas", "contratos", "modalidades"];

/** A pessoa cria ou edita o próprio perfil de talento. Pede o e-mail confirmado, como indicar e reivindicar. */
export async function salvarTalentoAcao(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirUsuario(MEU_PERFIL);
  const valores = valoresDoFormulario(dados, MULTIPLOS);
  if (!usuario.emailConfirmado) return { erro: AVISOS.confirmar_email.texto, valores };
  const resultado = esquemaDoTalento.safeParse({
    nome: texto(dados, "nome"),
    titulo: texto(dados, "titulo"),
    sobre: texto(dados, "sobre"),
    procura: texto(dados, "procura"),
    habilidades: texto(dados, "habilidades"),
    areas: dados.getAll("areas").map(String),
    contratos: dados.getAll("contratos").map(String),
    modalidades: dados.getAll("modalidades").map(String),
    municipio: texto(dados, "municipio"),
    email: texto(dados, "email"),
    whatsapp: texto(dados, "whatsapp"),
    link: texto(dados, "link"),
    aberto: texto(dados, "aberto") || "nao",
    consentimento: texto(dados, "consentimento"),
  });
  if (!resultado.success) return { erros: errosPorCampo(resultado.error), valores };
  const arquivo = await conferirCurriculo(dados.get("curriculo"));
  if ("erro" in arquivo) return { erros: { curriculo: arquivo.erro }, valores };

  const chave = arquivo.documento ? await guardarDocumento(arquivo.documento) : null;
  let salvo: Awaited<ReturnType<typeof salvarTalento>>;
  try {
    salvo = await salvarTalento(usuario.id, resultado.data, {
      curriculo: chave && arquivo.documento ? { chave, nome: (arquivo.documento.arquivo.name || "curriculo").slice(0, 120) } : null,
      removerCurriculo: texto(dados, "removerCurriculo") === "sim",
    });
  } catch (erro) {
    if (chave) await apagarDocumentosGuardados([chave]);
    throw erro;
  }
  if (salvo.curriculoAntigo) await apagarDocumentosGuardados([salvo.curriculoAntigo]);
  redirect(`${MEU_PERFIL}?aviso=${salvo.criado ? "talento_criado" : "talento_salvo"}`);
}

/** Liga ou desliga o "aberto a trabalho" sem mexer no resto do perfil. */
export async function alternarAbertoAcao(dados: FormData): Promise<void> {
  const usuario = await exigirUsuario(MEU_PERFIL);
  const aberto = texto(dados, "aberto") === "sim";
  await alternarAberto(usuario.id, aberto);
  redirect(`${MEU_PERFIL}?aviso=${aberto ? "talento_aberto" : "talento_pausado"}`);
}

/** A pessoa apaga o perfil e o currículo. */
export async function apagarTalentoAcao(): Promise<void> {
  const usuario = await exigirUsuario(MEU_PERFIL);
  const apagado = await apagarTalento(usuario.id);
  if (apagado?.curriculoChave) await apagarDocumentosGuardados([apagado.curriculoChave]);
  redirect("/vagas/talentos?aviso=talento_apagado");
}

/** A moderação tira o perfil da base ou o devolve. */
export async function moderarTalentoAcao(dados: FormData): Promise<void> {
  const moderador = await exigirModerador("acao");
  const suspender = texto(dados, "acao") === "suspender";
  await moderarTalento(texto(dados, "talentoId"), moderador.id, suspender, texto(dados, "motivo"));
  redirect("/moderacao/vagas?aviso=talento_moderado#talentos");
}
