import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// As Server Actions rodam fora do Next: o redirect vira um erro com o destino, e a
// sessão devolve a conta que o teste escolher.
const sessao = vi.hoisted(() => ({
  usuario: { id: "", nome: "", email: "", moderador: false },
  criarSessao: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirUsuario: async () => sessao.usuario,
  criarSessao: sessao.criarSessao,
  encerrarSessao: vi.fn(),
  caminhoSeguro: (valor: unknown, padrao = "/") => (typeof valor === "string" && valor.startsWith("/") ? valor : padrao),
}));
vi.mock("@/lib/auditoria", async (original) => {
  const modulo = await original<typeof import("@/lib/auditoria")>();
  return { registrarAuditoria: vi.fn(modulo.registrarAuditoria) };
});

const { cadastrar } = await import("@/acoes/conta");
const { publicarDepoimento } = await import("@/acoes/depoimentos");
const { indicarEmpresa } = await import("@/acoes/empresas");
const { registrarAuditoria } = await import("@/lib/auditoria");

async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE "RegistroAuditoria", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`,
  );
}

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

/**
 * Simula o outro envio que chegou junto: a consulta preliminar não encontra nada,
 * mas o registro já está no banco quando a criação acontece.
 */
function consultaPreliminarNaoEncontra(delegate: { findUnique: unknown }) {
  vi.spyOn(delegate as { findUnique: () => Promise<null> }, "findUnique").mockResolvedValueOnce(null);
}

const indicacao = {
  instagram: "@padaria.flor",
  nome: "Padaria Flor",
  categoria: "Café e padaria",
  municipio: "Recife - PE",
  resumo: "Pão de fermentação natural no bairro.",
};

let leitor: { id: string; nome: string; email: string };

beforeEach(async () => {
  await limparBanco();
  leitor = await db.usuario.create({ data: { nome: "Lauro Leitor", email: "lauro@exemplo.com", senhaHash: "scrypt$segredo" } });
  sessao.usuario = { ...leitor, moderador: false };
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("submissões duplicadas", () => {
  it("cadastro com e-mail criado por outro envio devolve o aviso do formulário, sem sessão", async () => {
    consultaPreliminarNaoEncontra(db.usuario);

    const estado = await cadastrar(undefined, formulario({ nome: "Outro Lauro", email: "lauro@exemplo.com", senha: "senha-segura-1" }));

    expect(estado?.erros?.email).toBe("Já existe uma conta com este e-mail. Que tal entrar?");
    expect(sessao.criarSessao).not.toHaveBeenCalled();
    expect(await db.usuario.count()).toBe(1);
  });

  it("indicação de @ criado por outro envio devolve o perfil existente, sem auditoria", async () => {
    const primeiro = await indicarEmpresa(undefined, formulario(indicacao)).catch((erro: Error) => erro.message);
    expect(primeiro).toBe("redirect:/empresas/padaria.flor?aviso=indicada");
    vi.mocked(registrarAuditoria).mockClear();
    consultaPreliminarNaoEncontra(db.empresa);

    const estado = await indicarEmpresa(undefined, formulario(indicacao));

    expect(estado).toMatchObject({ existente: "padaria.flor", erros: { instagram: "@padaria.flor já está no Negócio do Bem." } });
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(await db.registroAuditoria.count()).toBe(1);
  });

  it("depoimento repetido por outro envio devolve a mensagem de sempre", async () => {
    const empresa = await db.empresa.create({
      data: { instagramUsername: "livraria.raiz", nome: "Livraria Raiz", resumo: "Livros", categoria: "Serviços", cidade: "Recife", uf: "PE", moderacao: "aprovada" },
    });
    await db.depoimento.create({ data: { empresaId: empresa.id, autorId: leitor.id, texto: "Primeiro depoimento, com calma." } });
    consultaPreliminarNaoEncontra(db.depoimento);

    const estado = await publicarDepoimento(
      undefined,
      formulario({ empresaId: empresa.id, texto: "Segundo envio do mesmo depoimento, ao mesmo tempo." }),
    );

    expect(estado).toEqual({ erro: "Você já deixou um depoimento para este negócio. Obrigado!" });
    expect(await db.depoimento.count()).toBe(1);
  });

  it("falha da auditoria depois da criação não vira aviso de duplicado", async () => {
    const duplicadoNaAuditoria = new Prisma.PrismaClientKnownRequestError("falha na auditoria", { code: "P2002", clientVersion: "teste" });
    vi.mocked(registrarAuditoria).mockRejectedValueOnce(duplicadoNaAuditoria);

    await expect(indicarEmpresa(undefined, formulario(indicacao))).rejects.toBe(duplicadoNaAuditoria);
  });

  it("outros erros do banco continuam subindo", async () => {
    const outroErro = new Prisma.PrismaClientKnownRequestError("sem conexão", { code: "P1001", clientVersion: "teste" });
    vi.spyOn(db.usuario, "create").mockRejectedValueOnce(outroErro);

    await expect(cadastrar(undefined, formulario({ nome: "Nova Pessoa", email: "nova@exemplo.com", senha: "senha-segura-1" }))).rejects.toBe(
      outroErro,
    );
    expect(sessao.criarSessao).not.toHaveBeenCalled();
  });
});
