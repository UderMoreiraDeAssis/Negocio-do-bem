import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

const contexto = vi.hoisted(() => ({ usuarioId: "", disponivel: true, apagar: vi.fn(async () => {}), enviar: vi.fn(async () => ({})) }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!contexto.disponivel) throw new Error("Contexto ausente");
    return { env: { UPLOADS: { put: contexto.enviar, delete: contexto.apagar } } };
  },
}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirUsuario: async () => ({ id: contexto.usuarioId, moderador: false }),
  caminhoSeguro: (_valor: unknown, padrao: string) => padrao,
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/server", () => ({ after: () => {} }));

const { trocarFoto, removerFoto } = await import("@/acoes/empresas");
const antiga = "https://fotos.exemplo.com/perfis/antiga.jpg";

async function limpar() {
  await db.$executeRawUnsafe(`TRUNCATE "RegistroAuditoria", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`);
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://fotos.exemplo.com");
  contexto.disponivel = true;
  await limpar();
  const usuario = await db.usuario.create({ data: { nome: "Pessoa", email: "pessoa@exemplo.com", senhaHash: "x" } });
  contexto.usuarioId = usuario.id;
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
afterAll(async () => { await limpar(); await db.$disconnect(); });

async function empresaComFoto() {
  return db.empresa.create({ data: {
    instagramUsername: "loja", nome: "Loja", resumo: "Um negócio do bem", categoria: "Serviços", cidade: "Recife", uf: "PE", fotoUrl: antiga,
    membros: { create: { usuarioId: contexto.usuarioId, papel: "dono" } },
  } });
}

describe("edição de foto no Worker", () => {
  it("troca a foto sem apagar o objeto remoto nem marcar descarte", async () => {
    const empresa = await empresaComFoto();
    const dados = new FormData();
    dados.set("empresaId", empresa.id);
    dados.set("foto", new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg"));
    await expect(trocarFoto({}, dados)).rejects.toThrow("REDIRECT");
    expect(contexto.enviar).toHaveBeenCalledOnce();
    expect(contexto.apagar).not.toHaveBeenCalled();
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).fotoUrl).toMatch(/^https:\/\/fotos\.exemplo\.com\/perfis\//);
    expect(await db.registroAuditoria.count({ where: { acao: "foto.descarte_iniciado" } })).toBe(0);
  });

  it.each(["ausente", "conflitante"])("remove a referência com contexto %s sem tocar no R2", async (estado) => {
    if (estado === "ausente") contexto.disponivel = false;
    else vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://outras-fotos.exemplo.com");
    const empresa = await empresaComFoto();
    const dados = new FormData();
    dados.set("empresaId", empresa.id);
    await expect(removerFoto(dados)).rejects.toThrow("REDIRECT");
    expect(contexto.apagar).not.toHaveBeenCalled();
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).fotoUrl).toBeNull();
    expect(await db.registroAuditoria.count({ where: { acao: "foto.descarte_iniciado" } })).toBe(0);
  });

  it("remove a referência sem apagar o objeto remoto nem marcar descarte", async () => {
    const empresa = await empresaComFoto();
    const dados = new FormData();
    dados.set("empresaId", empresa.id);
    await expect(removerFoto(dados)).rejects.toThrow("REDIRECT");
    expect(contexto.apagar).not.toHaveBeenCalled();
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).fotoUrl).toBeNull();
    expect(await db.registroAuditoria.count({ where: { acao: "foto.descarte_iniciado" } })).toBe(0);
  });
});
