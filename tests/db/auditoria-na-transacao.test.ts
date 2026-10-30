import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// As Server Actions rodam fora do Next: o redirect vira um erro com o destino, e a
// sessão devolve a conta que o teste escolher. A auditoria e o apagar foto são os
// de verdade, mas espionados para o teste poder fazer a auditoria falhar.
const sessao = vi.hoisted(() => ({ usuario: { id: "", nome: "", email: "", moderador: false } }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirUsuario: async () => sessao.usuario,
  caminhoSeguro: (valor: unknown, padrao = "/") => (typeof valor === "string" && valor.startsWith("/") ? valor : padrao),
}));
vi.mock("@/lib/auditoria", async (original) => {
  const modulo = await original<typeof import("@/lib/auditoria")>();
  return { registrarAuditoria: vi.fn(modulo.registrarAuditoria) };
});
vi.mock("@/lib/armazenamento", async (original) => {
  const modulo = await original<typeof import("@/lib/armazenamento")>();
  return { ...modulo, apagarFoto: vi.fn(modulo.apagarFoto) };
});

const { alternarVisibilidade, indicarEmpresa, removerFoto, salvarEmpresa, trocarFoto } = await import("@/acoes/empresas");
const { aplicarFotoDoInstagram } = await import("@/lib/fotos-instagram");
const { registrarAuditoria } = await import("@/lib/auditoria");
const { apagarFoto } = await import("@/lib/armazenamento");

const PASTA_PERFIS = path.join(process.cwd(), "public", "enviados", "perfis");
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];
const arquivoWebp = () => new File([new Uint8Array(WEBP)], "perfil.webp", { type: "image/webp" });
const FOTO_ANTIGA = "/enviados/perfis/foto-antiga.webp";

async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE "RegistroAuditoria", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`,
  );
}

async function fotosNaPasta(): Promise<string[]> {
  return readdir(PASTA_PERFIS).catch(() => []);
}

function formulario(campos: Record<string, string | File | string[]>) {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) {
    if (Array.isArray(valor)) for (const item of valor) dados.append(nome, item);
    else dados.set(nome, valor);
  }
  return dados;
}

/** A próxima gravação da auditoria falha, como se o insert desse erro. */
function auditoriaFalha() {
  vi.mocked(registrarAuditoria).mockRejectedValueOnce(new Error("auditoria fora do ar"));
}

/** Roda a ação e devolve o destino do redirect, ou o erro que ela lançou. */
async function executar(acao: Promise<unknown>): Promise<string> {
  return acao.then(
    () => "sem redirect",
    (erro: Error) => erro.message,
  );
}

const camposDoNegocio = {
  nome: "Padaria Flor",
  categoria: "Café e padaria",
  municipio: "Recife - PE",
  resumo: "Pão de fermentação natural no bairro.",
};

let fotosAntes: string[];
let dona: { id: string; nome: string; email: string };
let empresaId: string;

beforeAll(async () => {
  fotosAntes = await fotosNaPasta();
});
beforeEach(async () => {
  await limparBanco();
  dona = await db.usuario.create({ data: { nome: "Dalva Dona", email: "dalva@exemplo.com", senhaHash: "scrypt$segredo" } });
  sessao.usuario = { ...dona, moderador: false };
  const empresa = await db.empresa.create({
    data: {
      instagramUsername: "padaria.flor",
      ...{ nome: "Padaria Flor", resumo: "Um negócio do bem", categoria: "Café e padaria", cidade: "Recife", uf: "PE" },
      moderacao: "aprovada",
      status: "verificada",
      fotoUrl: FOTO_ANTIGA,
      causas: { create: [{ causa: "sustentavel" }] },
      membros: { create: { usuarioId: dona.id } },
    },
  });
  empresaId = empresa.id;
});
// As fotos novas gravadas nos testes vão para public/enviados: apaga o que não estava lá.
afterEach(async () => {
  vi.clearAllMocks();
  const novas = (await fotosNaPasta()).filter((nome) => !fotosAntes.includes(nome));
  await Promise.all(novas.map((nome) => unlink(path.join(PASTA_PERFIS, nome))));
});
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("alteração e auditoria na mesma transação", () => {
  it("indicação: sem a auditoria, o negócio não é criado", async () => {
    auditoriaFalha();

    expect(await executar(indicarEmpresa(undefined, formulario({ ...camposDoNegocio, instagram: "@livraria.raiz" })))).toBe(
      "auditoria fora do ar",
    );

    expect(await db.empresa.findUnique({ where: { instagramUsername: "livraria.raiz" } })).toBeNull();
  });

  it("indicação: o caminho normal cria o negócio e registra uma vez", async () => {
    expect(await executar(indicarEmpresa(undefined, formulario({ ...camposDoNegocio, instagram: "@livraria.raiz" })))).toBe(
      "redirect:/empresas/livraria.raiz?aviso=indicada",
    );

    const empresa = await db.empresa.findUniqueOrThrow({ where: { instagramUsername: "livraria.raiz" } });
    expect(await db.registroAuditoria.findMany({ where: { alvoId: empresa.id } })).toMatchObject([{ acao: "empresa.indicada" }]);
  });

  it("edição: sem a auditoria, os dados e as causas continuam os de antes", async () => {
    auditoriaFalha();
    const dados = formulario({ ...camposDoNegocio, empresaId, nome: "Nome Novo", causas: ["liderado-por-mulheres"] });

    expect(await executar(salvarEmpresa(undefined, dados))).toBe("auditoria fora do ar");

    const empresa = await db.empresa.findUniqueOrThrow({ where: { id: empresaId }, include: { causas: true } });
    expect(empresa.nome).toBe("Padaria Flor");
    expect(empresa.causas.map((c) => c.causa)).toEqual(["sustentavel"]);
  });

  it("edição: o caminho normal salva e registra uma vez", async () => {
    const dados = formulario({ ...camposDoNegocio, empresaId, nome: "Nome Novo", causas: ["liderado-por-mulheres"] });

    expect(await executar(salvarEmpresa(undefined, dados))).toBe("redirect:/painel/padaria.flor?aviso=salvo");

    const empresa = await db.empresa.findUniqueOrThrow({ where: { id: empresaId }, include: { causas: true } });
    expect(empresa.nome).toBe("Nome Novo");
    expect(empresa.causas.map((c) => c.causa)).toEqual(["liderado-por-mulheres"]);
    expect(await db.registroAuditoria.findMany()).toMatchObject([{ acao: "empresa.editada", alvoId: empresaId }]);
  });

  it("visibilidade: sem a auditoria, o negócio não é ocultado", async () => {
    auditoriaFalha();

    expect(await executar(alternarVisibilidade(formulario({ empresaId, ocultar: "sim" })))).toBe("auditoria fora do ar");

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).oculta).toBe(false);
  });

  it("visibilidade: o caminho normal oculta e registra uma vez", async () => {
    expect(await executar(alternarVisibilidade(formulario({ empresaId, ocultar: "sim" })))).toBe(
      "redirect:/painel/padaria.flor?aviso=oculta",
    );

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).oculta).toBe(true);
    expect(await db.registroAuditoria.findMany()).toMatchObject([{ acao: "empresa.ocultada" }]);
  });

  it("troca de foto: sem a auditoria, a foto antiga continua no perfil e não é apagada", async () => {
    auditoriaFalha();

    expect(await executar(trocarFoto(undefined, formulario({ empresaId, foto: arquivoWebp() })))).toBe("auditoria fora do ar");

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).fotoUrl).toBe(FOTO_ANTIGA);
    expect(apagarFoto).not.toHaveBeenCalled();
  });

  it("troca de foto: o caminho normal grava a nova, apaga a antiga e registra uma vez", async () => {
    expect(await executar(trocarFoto(undefined, formulario({ empresaId, foto: arquivoWebp() })))).toBe(
      "redirect:/painel/padaria.flor?aviso=foto_salva",
    );

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).fotoUrl).toMatch(/^\/enviados\/perfis\/[0-9a-f]+\.webp$/);
    expect(apagarFoto).toHaveBeenCalledWith(FOTO_ANTIGA);
    expect(await db.registroAuditoria.findMany()).toMatchObject([{ acao: "empresa.foto_trocada" }]);
  });

  it("remoção de foto: sem a auditoria, a foto continua no perfil e não é apagada", async () => {
    auditoriaFalha();

    expect(await executar(removerFoto(formulario({ empresaId })))).toBe("auditoria fora do ar");

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).fotoUrl).toBe(FOTO_ANTIGA);
    expect(apagarFoto).not.toHaveBeenCalled();
  });

  it("remoção de foto: o caminho normal tira a foto, apaga o arquivo e registra uma vez", async () => {
    expect(await executar(removerFoto(formulario({ empresaId })))).toBe("redirect:/painel/padaria.flor?aviso=foto_removida");

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).fotoUrl).toBeNull();
    expect(apagarFoto).toHaveBeenCalledWith(FOTO_ANTIGA);
    expect(await db.registroAuditoria.findMany()).toMatchObject([{ acao: "empresa.foto_removida" }]);
  });

  it("foto do Instagram: sem a auditoria, o perfil continua sem foto e a foto nova não é apagada", async () => {
    await db.empresa.update({ where: { id: empresaId }, data: { fotoUrl: null } });
    auditoriaFalha();

    await expect(aplicarFotoDoInstagram(empresaId, { arquivo: arquivoWebp(), tipo: "image/webp" })).rejects.toThrow(
      "auditoria fora do ar",
    );

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).fotoUrl).toBeNull();
    expect(apagarFoto).not.toHaveBeenCalled();
  });

  it("foto do Instagram: a foto do dono continua valendo e não há auditoria", async () => {
    expect(await aplicarFotoDoInstagram(empresaId, { arquivo: arquivoWebp(), tipo: "image/webp" })).toBe("ja_tem_foto");

    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).fotoUrl).toBe(FOTO_ANTIGA);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});
