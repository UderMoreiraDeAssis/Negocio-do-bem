import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { avisarCorrecao, decidirCorrecao, editarMotivoIndicacao } from "@/acoes/correcoes";
import { db } from "@/lib/db";

const acesso = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => acesso.token ? { value: acesso.token } : undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirect:${destino}`); },
  notFound: () => { throw new Error("404"); },
}));

let empresaId: string;
let membroId: string;
let moderadorId: string;

function formulario(campos: Record<string, string> = {}) {
  const dados = new FormData();
  for (const [campo, valor] of Object.entries({ empresaId, problema: "A cidade está incorreta", correcao: "Recife, PE", fonte: "https://exemplo.com/local", ...campos })) dados.set(campo, valor);
  return dados;
}

async function limpar() {
  await db.$executeRawUnsafe('ALTER TABLE "RegistroAuditoria" DROP CONSTRAINT IF EXISTS "falha_correcao_teste"');
  await db.$executeRawUnsafe('TRUNCATE "RegistroAuditoria", "Empresa", "Usuario" CASCADE');
}

beforeEach(async () => {
  await limpar();
  acesso.token = "membro";
  for (const papel of ["membro", "moderador"]) {
    const usuario = await db.usuario.create({ data: { nome: papel, email: `${papel}@exemplo.test`, papel } });
    if (papel === "membro") membroId = usuario.id;
    else moderadorId = usuario.id;
    await db.sessao.create({ data: { id: createHash("sha256").update(papel).digest("hex"), usuarioId: usuario.id, expiraEm: new Date(Date.now() + 60_000) } });
  }
  empresaId = (await db.empresa.create({ data: {
    instagramUsername: "correcao.teste", nome: "Negócio fictício", categoria: "Serviços", cidade: "Natal", uf: "RN",
    resumo: "Negócio usado apenas nos testes", moderacao: "aprovada", motivoIndicacao: "Motivo original",
  } })).id;
});
afterAll(async () => { await limpar(); await db.$disconnect(); });

async function criarAviso() {
  await expect(avisarCorrecao(undefined, formulario())).rejects.toThrow("aviso=correcao_enviada");
  return db.correcaoPerfil.findFirstOrThrow();
}

describe("avisos de correção", () => {
  it("guarda o aviso privado e a autoria, sem alterar dados ou conceder propriedade", async () => {
    const aviso = await criarAviso();
    expect(aviso).toMatchObject({ empresaId, autorId: membroId, problema: "A cidade está incorreta", correcao: "Recife, PE", fonte: "https://exemplo.com/local", status: "pendente" });
    expect(await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).toMatchObject({ cidade: "Natal", uf: "RN", motivoIndicacao: "Motivo original" });
    expect(await db.empresaMembro.count()).toBe(0);
    expect(await db.registroAuditoria.findFirstOrThrow()).toMatchObject({ usuarioId: membroId, acao: "correcao.enviada", alvoId: empresaId });
  });

  it("recusa status desconhecido mesmo em gravação direta no banco", async () => {
    await expect(db.correcaoPerfil.create({
      data: {
        empresaId,
        autorId: membroId,
        problema: "Dado informado incorretamente",
        correcao: "Correção sugerida",
        status: "estado_invalido",
      },
    })).rejects.toThrow();
    expect(await db.correcaoPerfil.count()).toBe(0);
  });

  it("exige sessão válida no servidor", async () => {
    acesso.token = "";
    await expect(avisarCorrecao(undefined, formulario())).rejects.toThrow("redirect:/entrar");
    expect(await db.correcaoPerfil.count()).toBe(0);
  });

  it.each(["oculto", "rejeitado", "com dono"])("recusa aviso de perfil %s", async (caso) => {
    if (caso === "com dono") await db.empresaMembro.create({ data: { empresaId, usuarioId: membroId } });
    else await db.empresa.update({ where: { id: empresaId }, data: caso === "oculto" ? { oculta: true } : { moderacao: "rejeitada" } });
    expect((await avisarCorrecao(undefined, formulario()))?.erro).toContain("não está disponível");
    expect(await db.correcaoPerfil.count()).toBe(0);
  });

  it("recusa um link executável e mantém os campos após validação", async () => {
    const estado = await avisarCorrecao(undefined, formulario({ fonte: "javascript:alert(1)" }));
    expect(estado?.erros?.fonte).toBeTruthy();
    expect(estado?.valores?.problema).toBe("A cidade está incorreta");
    expect(await db.correcaoPerfil.count()).toBe(0);
  });

  it("aceita ausência de fonte e recusa textos acima do limite", async () => {
    expect((await avisarCorrecao(undefined, formulario({ problema: "a".repeat(1001) })))?.erros?.problema).toBeTruthy();
    await expect(avisarCorrecao(undefined, formulario({ fonte: "" }))).rejects.toThrow("aviso=correcao_enviada");
    expect((await db.correcaoPerfil.findFirstOrThrow()).fonte).toBeNull();
  });

  it("limita a dez avisos por conta em 24 horas, inclusive simultâneos e já decididos", async () => {
    await db.correcaoPerfil.createMany({ data: Array.from({ length: 9 }, () => ({ empresaId, autorId: membroId, problema: "Problema antigo", correcao: "Correção", status: "corrigido" })) });
    const resultados = await Promise.allSettled([avisarCorrecao(undefined, formulario()), avisarCorrecao(undefined, formulario())]);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "fulfilled")).toMatchObject({ value: { erro: expect.stringContaining("10 avisos") } });
    expect(await db.correcaoPerfil.count()).toBe(10);
    expect(await db.registroAuditoria.count()).toBe(1);
  });

  it("libera a cota quando os avisos saem da janela de 24 horas", async () => {
    await db.correcaoPerfil.createMany({ data: Array.from({ length: 10 }, () => ({ empresaId, autorId: membroId, problema: "Problema antigo", correcao: "Correção", criadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000) })) });
    await criarAviso();
    expect(await db.correcaoPerfil.count()).toBe(11);
  });

  it("desfaz o envio quando a auditoria falha", async () => {
    await db.$executeRawUnsafe('ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "falha_correcao_teste" CHECK (false) NOT VALID');
    await expect(avisarCorrecao(undefined, formulario())).rejects.toThrow();
    expect(await db.correcaoPerfil.count()).toBe(0);
  });
});

describe("decisões e edição pela moderação", () => {
  it.each(["", "membro"])("recusa decisão e edição sem papel de moderação (%s)", async (token) => {
    const aviso = await criarAviso();
    acesso.token = token;
    await expect(decidirCorrecao(formulario({ correcaoId: aviso.id, decisao: "corrigido" }))).rejects.toThrow("redirect:/404");
    await expect(editarMotivoIndicacao(undefined, formulario({ motivo: "Alteração indevida" }))).rejects.toThrow("redirect:/404");
    expect((await db.correcaoPerfil.findUniqueOrThrow({ where: { id: aviso.id } })).status).toBe("pendente");
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).motivoIndicacao).toBe("Motivo original");
  });

  it("aplica só uma das decisões concorrentes e registra o revisor na auditoria", async () => {
    const aviso = await criarAviso();
    acesso.token = "moderador";
    const resultados = await Promise.allSettled(["corrigido", "sem_mudanca"].map((decisao) => decidirCorrecao(formulario({ correcaoId: aviso.id, decisao }))));
    expect(resultados.filter((r) => r.status === "rejected" && String(r.reason).includes("aviso=feito"))).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected" && String(r.reason).includes("aviso=ja_processada"))).toHaveLength(1);
    const decidida = await db.correcaoPerfil.findUniqueOrThrow({ where: { id: aviso.id } });
    expect(decidida.revisadoPorId).toBe(moderadorId);
    expect(decidida.revisadoEm).toBeInstanceOf(Date);
    expect(await db.registroAuditoria.count({ where: { usuarioId: moderadorId, acao: `correcao.${decidida.status}` } })).toBe(1);
  });

  it("recusa decisão desconhecida sem encerrar o aviso", async () => {
    const aviso = await criarAviso();
    acesso.token = "moderador";
    await expect(decidirCorrecao(formulario({ correcaoId: aviso.id, decisao: "inventada" }))).rejects.toThrow("redirect:/moderacao?aba=correcoes");
    expect((await db.correcaoPerfil.findUniqueOrThrow({ where: { id: aviso.id } })).status).toBe("pendente");
  });

  it("edita e apaga o motivo, registrando cada mudança", async () => {
    acesso.token = "moderador";
    for (const motivo of ["Motivo corrigido", ""]) {
      await expect(editarMotivoIndicacao(undefined, formulario({ motivo }))).rejects.toThrow("aviso=salvo");
      expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).motivoIndicacao).toBe(motivo || null);
    }
    expect(await db.registroAuditoria.count({ where: { acao: "empresa.motivo_editado", usuarioId: moderadorId } })).toBe(2);
  });

  it("desfaz decisão e edição do motivo se a auditoria falha", async () => {
    const aviso = await criarAviso();
    acesso.token = "moderador";
    await db.$executeRawUnsafe('ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "falha_correcao_teste" CHECK (false) NOT VALID');
    await expect(decidirCorrecao(formulario({ correcaoId: aviso.id, decisao: "corrigido" }))).rejects.toThrow();
    await expect(editarMotivoIndicacao(undefined, formulario({ motivo: "" }))).rejects.toThrow();
    expect((await db.correcaoPerfil.findUniqueOrThrow({ where: { id: aviso.id } })).status).toBe("pendente");
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).motivoIndicacao).toBe("Motivo original");
  });
});
