import { execFileSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { verificarSenha } from "@/lib/auth/senha";
import { db } from "@/lib/db";
import { URL_BANCO_TESTE } from "../banco-de-teste";

function executarSeed(ambiente = "development") {
  // O subprocesso não herda configuração de deploy nem conexão com outro banco.
  execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: URL_BANCO_TESTE,
      NODE_ENV: "development",
      ...(ambiente === "development" ? {} : { DEPLOY_ENV: ambiente }),
    },
    stdio: "pipe",
  });
}

async function limparBanco() {
  await db.$executeRawUnsafe(`TRUNCATE "CadastroGoogle", "TentativaAcesso", "Embaixador", "Usuario", "Empresa" CASCADE`);
}

async function dadosDoBanco() {
  return {
    contas: await db.usuario.findMany({ orderBy: { id: "asc" } }),
    empresas: await db.empresa.findMany({ orderBy: { id: "asc" } }),
    causas: await db.empresaCausa.findMany({ orderBy: [{ empresaId: "asc" }, { causa: "asc" }] }),
    donos: await db.empresaMembro.findMany({ orderBy: [{ empresaId: "asc" }, { usuarioId: "asc" }] }),
    depoimentos: await db.depoimento.findMany({ orderBy: { id: "asc" } }),
    pedidos: await db.reivindicacao.findMany({ orderBy: { id: "asc" } }),
    embaixadores: await db.embaixador.findMany({ orderBy: { id: "asc" } }),
  };
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("seed de demonstração", () => {
  it("cria as cinco contas confirmadas com senha atual e preserva os vínculos dos exemplos", async () => {
    executarSeed();
    const contas = await db.usuario.findMany({ orderBy: { email: "asc" } });
    expect(contas.map(({ nome, email, papel, telefone, googleId }) => ({ nome, email, papel, telefone, googleId }))).toEqual([
      { nome: "Ana Lúcia Santos", email: "ana@exemplo.com", papel: "membro", telefone: null, googleId: null },
      { nome: "Bia Fernandes", email: "bia@exemplo.com", papel: "membro", telefone: null, googleId: null },
      { nome: "Carla Moreira", email: "carla@exemplo.com", papel: "membro", telefone: null, googleId: null },
      { nome: "João Batista", email: "joao@exemplo.com", papel: "membro", telefone: null, googleId: null },
      { nome: "Equipe de Moderação", email: "moderacao@exemplo.com", papel: "moderador", telefone: null, googleId: null },
    ]);
    for (const conta of contas) {
      expect(conta.emailConfirmadoEm).toBeInstanceOf(Date);
      expect(conta.senhaHash).toMatch(/^scrypt\$32768\$8\$1\$/);
      expect(await verificarSenha("senha-demo-123", conta.senhaHash!)).toBe(true);
    }
    expect(new Set(contas.map((conta) => conta.senhaHash)).size).toBe(1);
    expect(new Set(contas.map((conta) => conta.emailConfirmadoEm!.getTime())).size).toBe(1);

    const empresas = await db.empresa.findMany({
      orderBy: { instagramUsername: "asc" },
      include: { indicadaPor: true, membros: { include: { usuario: true } }, causas: true },
    });
    expect(empresas.map((empresa) => [empresa.instagramUsername, empresa.indicadaPor!.email, empresa.membros.map((membro) => membro.usuario.email)])).toEqual([
      ["atelie.raizpreta.exemplo", "joao@exemplo.com", ["joao@exemplo.com"]],
      ["barbearia.doze.exemplo", "joao@exemplo.com", []],
      ["cafe.arcoiris.exemplo", "joao@exemplo.com", []],
      ["cuidar.junto.exemplo", "joao@exemplo.com", []],
      ["livraria.encontro.exemplo", "ana@exemplo.com", []],
      ["mercearia.coletiva.exemplo", "bia@exemplo.com", ["bia@exemplo.com"]],
      ["padaria.florescer.exemplo", "ana@exemplo.com", ["ana@exemplo.com"]],
      ["pousada.maeterra.exemplo", "ana@exemplo.com", []],
      ["studio.semente.exemplo", "bia@exemplo.com", ["bia@exemplo.com"]],
    ]);
    expect(empresas.map((empresa) => empresa.causas.length)).toEqual([4, 2, 3, 3, 3, 4, 4, 3, 4]);
    expect(empresas.filter((empresa) => empresa.moderacao === "pendente").map((empresa) => empresa.instagramUsername)).toEqual(["barbearia.doze.exemplo"]);
    expect(empresas.filter((empresa) => empresa.status === "verificada")).toHaveLength(4);
    expect(await db.empresaMembro.count({ where: { papel: "dono" } })).toBe(4);

    const depoimentos = await db.depoimento.findMany({ include: { autor: true, empresa: true } });
    expect(depoimentos.map((d) => `${d.empresa.instagramUsername}:${d.autor.email}`).sort()).toEqual([
      "atelie.raizpreta.exemplo:ana@exemplo.com",
      "cafe.arcoiris.exemplo:joao@exemplo.com",
      "mercearia.coletiva.exemplo:carla@exemplo.com",
      "padaria.florescer.exemplo:carla@exemplo.com",
      "padaria.florescer.exemplo:joao@exemplo.com",
    ]);
    expect(depoimentos.filter((d) => d.resposta !== null)).toHaveLength(1);
    expect(await db.reivindicacao.findFirstOrThrow({ include: { usuario: true, empresa: true } })).toMatchObject({
      usuario: { email: "carla@exemplo.com" },
      empresa: { instagramUsername: "cafe.arcoiris.exemplo" },
      metodo: "documento",
      status: "pendente",
      cnpj: "11222333000181",
    });
    expect(await db.reivindicacao.count()).toBe(1);
    expect(await db.sessao.count()).toBe(0);
  });

  it("repetir o seed não duplica dados nem sobrescreve contas alteradas ou relações existentes", async () => {
    executarSeed();
    await db.usuario.update({
      where: { email: "ana@exemplo.com" },
      data: { nome: "Nome alterado", senhaHash: null, telefone: "5511999999999", googleId: "google-existente", emailConfirmadoEm: null, papel: "moderador" },
    });
    await db.usuario.create({ data: { nome: "Conta legada", email: "legada@exemplo.com", senhaHash: "hash-invalido" } });
    const antes = await dadosDoBanco();
    executarSeed();
    executarSeed();
    expect(await dadosDoBanco()).toEqual(antes);
  });

  it("a presença isolada de moderacao@exemplo.com mantém a saída antecipada sem preencher outros exemplos", async () => {
    await db.usuario.create({ data: { nome: "Conta existente", email: "moderacao@exemplo.com", senhaHash: "hash-invalido" } });
    const antes = await dadosDoBanco();
    executarSeed();
    expect(await dadosDoBanco()).toEqual(antes);
  });

  it("em preview não altera banco ocupado por outra conta", async () => {
    await db.usuario.create({ data: { nome: "Outra conta", email: "outra@exemplo.com" } });
    const antes = await dadosDoBanco();
    executarSeed("preview");
    expect(await dadosDoBanco()).toEqual(antes);
  });

  it("recusa produção sem gravar dados", async () => {
    expect(() => executarSeed("production")).toThrow();
    expect(await db.usuario.count()).toBe(0);
    expect(await db.empresa.count()).toBe(0);
  });
});
