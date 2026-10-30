"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { gerarHashSenha, verificarSenha } from "@/lib/auth/senha";
import { caminhoSeguro, criarSessao, encerrarSessao } from "@/lib/auth/sessao";
import { db, semDuplicar } from "@/lib/db";
import { errosPorCampo, texto, valoresDoFormulario, type EstadoFormulario } from "@/lib/formulario";

const esquemaCadastro = z.object({
  nome: z.string().trim().min(2, "Conte como podemos te chamar.").max(80, "Nome muito longo."),
  email: z.email("Digite um e-mail válido.").max(200, "E-mail muito longo."),
  senha: z.string().min(8, "Use pelo menos 8 caracteres.").max(200, "Senha muito longa."),
});

export async function cadastrar(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const resultado = esquemaCadastro.safeParse({
    nome: texto(dados, "nome"),
    email: texto(dados, "email").trim().toLowerCase(),
    senha: texto(dados, "senha"),
  });
  if (!resultado.success) {
    return { erros: errosPorCampo(resultado.error), valores: valoresDoFormulario(dados) };
  }
  const { nome, email, senha } = resultado.data;

  const emailEmUso: EstadoFormulario = {
    erros: { email: "Já existe uma conta com este e-mail. Que tal entrar?" },
    valores: valoresDoFormulario(dados),
  };
  if (await db.usuario.findUnique({ where: { email } })) return emailEmUso;

  const senhaHash = await gerarHashSenha(senha);
  const usuario = await semDuplicar(db.usuario.create({ data: { nome, email, senhaHash } }));
  if (!usuario) return emailEmUso;
  await criarSessao(usuario.id);
  redirect(caminhoSeguro(texto(dados, "voltar")));
}

// Hash de uma senha qualquer: quando o e-mail não existe, conferimos contra ele
// para a resposta demorar o mesmo tempo e não revelar quais e-mails têm conta.
let hashFalso: Promise<string> | undefined;

export async function entrar(_estado: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const email = texto(dados, "email").trim().toLowerCase();
  const senha = texto(dados, "senha");
  const usuario = email ? await db.usuario.findUnique({ where: { email } }) : null;
  const senhaConfere = await verificarSenha(senha, usuario?.senhaHash ?? (await (hashFalso ??= gerarHashSenha("senha-que-nao-existe"))));

  if (!usuario || !senhaConfere) {
    return { erro: "E-mail ou senha incorretos.", valores: valoresDoFormulario(dados) };
  }
  await criarSessao(usuario.id);
  redirect(caminhoSeguro(texto(dados, "voltar")));
}

export async function sair(): Promise<void> {
  await encerrarSessao();
  redirect("/");
}
