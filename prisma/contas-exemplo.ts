import type { PrismaClient } from "../src/generated/prisma/client";
import { gerarHashSenha } from "../src/lib/auth/senha";

export const SENHA_DEMO = "senha-demo-123";

export async function criarContasExemplo(db: PrismaClient) {
  const senhaHash = await gerarHashSenha(SENHA_DEMO);
  // Mantém as contas legadas de demonstração sem telefone e já confirmadas.
  const emailConfirmadoEm = new Date();
  return {
    moderacao: await db.usuario.create({ data: { nome: "Equipe de Moderação", email: "moderacao@exemplo.com", senhaHash, emailConfirmadoEm, papel: "moderador" } }),
    ana: await db.usuario.create({ data: { nome: "Ana Lúcia Santos", email: "ana@exemplo.com", senhaHash, emailConfirmadoEm } }),
    joao: await db.usuario.create({ data: { nome: "João Batista", email: "joao@exemplo.com", senhaHash, emailConfirmadoEm } }),
    bia: await db.usuario.create({ data: { nome: "Bia Fernandes", email: "bia@exemplo.com", senhaHash, emailConfirmadoEm } }),
    carla: await db.usuario.create({ data: { nome: "Carla Moreira", email: "carla@exemplo.com", senhaHash, emailConfirmadoEm } }),
  };
}
