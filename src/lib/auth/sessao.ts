import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";

const COOKIE = "ndb_sessao";
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  moderador: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Só o papel gravado no banco dá moderação. O cadastro não confirma o e-mail,
 * então nenhuma regra pode dar acesso pelo e-mail: quem se cadastrasse primeiro
 * com o endereço certo levaria a moderação. Para dar ou tirar: `npm run moderacao`.
 */
export function ehModerador(usuario: { papel: string }): boolean {
  return usuario.papel === "moderador";
}

/** Cria a sessão e grava o cookie. Só pode ser chamada em Server Actions e Route Handlers. */
export async function criarSessao(usuarioId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await db.sessao.create({ data: { id: hashToken(token), usuarioId, expiraEm } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

export async function encerrarSessao(): Promise<void> {
  const loja = await cookies();
  const token = loja.get(COOKIE)?.value;
  if (token) await db.sessao.deleteMany({ where: { id: hashToken(token) } });
  loja.delete(COOKIE);
}

/** Usuário logado nesta requisição, ou null. Lido uma vez por requisição. */
export const usuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sessao = await db.sessao.findUnique({
    where: { id: hashToken(token) },
    include: { usuario: true },
  });
  if (!sessao || sessao.expiraEm <= new Date()) return null;
  const { usuario } = sessao;
  return { id: usuario.id, nome: usuario.nome, email: usuario.email, moderador: ehModerador(usuario) };
});

/** Exige login; senão manda para /entrar e volta para `voltarPara` depois. */
export async function exigirUsuario(voltarPara: string): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect(`/entrar?voltar=${encodeURIComponent(voltarPara)}`);
  return usuario;
}

/** Para quem não é moderador, a área de moderação simplesmente não existe. */
export async function exigirModerador(): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  if (!usuario?.moderador) notFound();
  return usuario;
}

/** Aceita só caminhos internos, para o ?voltar= não virar um redirecionamento aberto. */
export function caminhoSeguro(valor: unknown, padrao = "/"): string {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) {
    return padrao;
  }
  return valor;
}
