import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  aprovar,
  aprovarPendentesSemDono,
  ErroReivindicacao,
  iniciarPorCodigoDm,
  processarDm,
  processarLoginInstagram,
  recusar,
  solicitarPorDocumento,
} from "@/lib/reivindicacao";

async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE "RegistroAuditoria", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`,
  );
}

let contador = 0;
async function criarUsuario(nome = "Pessoa") {
  contador++;
  return db.usuario.create({ data: { nome, email: `pessoa${contador}@exemplo.com`, senhaHash: "x" } });
}

async function criarEmpresa(username: string, extra: Partial<{ instagramUserId: string; instagramIgsid: string }> = {}) {
  return db.empresa.create({
    data: {
      instagramUsername: username,
      nome: `Negócio ${username}`,
      resumo: "Um negócio do bem",
      categoria: "Serviços",
      cidade: "Recife",
      uf: "PE",
      moderacao: "aprovada",
      ...extra,
    },
  });
}

async function donos(empresaId: string) {
  const membros = await db.empresaMembro.findMany({ where: { empresaId } });
  return membros.map((m) => m.usuarioId).sort();
}

const responde = (username: string | null) => async () => username;

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("código por DM", () => {
  it("gera um código e reaproveita enquanto ele vale", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("padaria.flor");

    const primeira = await iniciarPorCodigoDm(empresa.id, dono.id);
    const segunda = await iniciarPorCodigoDm(empresa.id, dono.id);

    expect(primeira.codigo).toMatch(/^BEM-/);
    expect(segunda.id).toBe(primeira.id);
    expect(primeira.expiraEm.getTime()).toBeGreaterThan(Date.now() + 47 * 60 * 60 * 1000);
  });

  it("gera um código novo quando o anterior expirou", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("padaria.flor");
    const velha = await iniciarPorCodigoDm(empresa.id, dono.id);
    await db.reivindicacao.update({ where: { id: velha.id }, data: { expiraEm: new Date(Date.now() - 1000) } });

    const nova = await iniciarPorCodigoDm(empresa.id, dono.id);

    expect(nova.id).not.toBe(velha.id);
    expect((await db.reivindicacao.findUnique({ where: { id: velha.id } }))?.status).toBe("expirada");
  });

  it("aprova sozinho quando a DM vem do @ do negócio", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("padaria.flor");
    const { codigo } = await iniciarPorCodigoDm(empresa.id, dono.id);

    const resultado = await processarDm({
      remetenteId: "igsid-1",
      texto: `oi, segue o código ${codigo}`,
      buscarUsername: responde("padaria.flor"),
    });

    expect(resultado).toBe("aprovada");
    expect(await donos(empresa.id)).toEqual([dono.id]);
    const atualizada = await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(atualizada.status).toBe("verificada");
    expect(atualizada.instagramIgsid).toBe("igsid-1");
    expect(await db.registroAuditoria.count({ where: { alvoId: empresa.id, usuarioId: null } })).toBe(1);
  });

  it("não aprova quando a DM vem de outro @", async () => {
    const golpista = await criarUsuario();
    const empresa = await criarEmpresa("padaria.flor");
    const { codigo, id } = await iniciarPorCodigoDm(empresa.id, golpista.id);

    const resultado = await processarDm({
      remetenteId: "igsid-2",
      texto: codigo!,
      buscarUsername: responde("outra.conta"),
    });

    expect(resultado).toBe("em_analise");
    expect(await donos(empresa.id)).toEqual([]);
    const reivindicacao = await db.reivindicacao.findUniqueOrThrow({ where: { id } });
    expect(reivindicacao.status).toBe("pendente");
    expect(reivindicacao.notas).toContain("@outra.conta");
  });

  it("deixa para a moderação quando não dá para descobrir o @", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("padaria.flor");
    const { codigo, id } = await iniciarPorCodigoDm(empresa.id, dono.id);

    expect(await processarDm({ remetenteId: "x", texto: codigo!, buscarUsername: responde(null) })).toBe("em_analise");
    expect((await db.reivindicacao.findUniqueOrThrow({ where: { id } })).notas).toContain("Confira no Instagram");
  });

  it("ignora mensagens sem código ou com código desconhecido", async () => {
    expect(await processarDm({ remetenteId: "x", texto: "olá!", buscarUsername: responde("a") })).toBe("ignorada");
    expect(await processarDm({ remetenteId: "x", texto: "BEM-AAAAAA", buscarUsername: responde("a") })).toBe("ignorada");
  });

  it("não aceita código expirado", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("padaria.flor");
    const { codigo, id } = await iniciarPorCodigoDm(empresa.id, dono.id);
    await db.reivindicacao.update({ where: { id }, data: { expiraEm: new Date(Date.now() - 1000) } });

    expect(await processarDm({ remetenteId: "x", texto: codigo!, buscarUsername: responde("padaria.flor") })).toBe(
      "em_analise",
    );
    expect(await donos(empresa.id)).toEqual([]);
  });

  it("quando já existe dono, a moderação decide e pode transferir", async () => {
    const antigo = await criarUsuario("Antigo");
    const novo = await criarUsuario("Novo");
    const empresa = await criarEmpresa("padaria.flor");
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: antigo.id } });
    const moderador = await criarUsuario("Moderação");
    const { codigo, id } = await iniciarPorCodigoDm(empresa.id, novo.id);

    expect(
      await processarDm({ remetenteId: "igsid-novo", texto: codigo!, buscarUsername: responde("padaria.flor") }),
    ).toBe("em_analise");
    expect(await donos(empresa.id)).toEqual([antigo.id]);

    await aprovar({ reivindicacaoId: id, revisorId: moderador.id, modo: "transferir" });

    expect(await donos(empresa.id)).toEqual([novo.id]);
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).instagramIgsid).toBe("igsid-novo");
  });
});

describe("Entrar com Instagram", () => {
  it("aprova na hora quando a conta é a do negócio", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("casa.do_bem");

    const resultado = await processarLoginInstagram({
      empresaId: empresa.id,
      usuarioId: dono.id,
      conta: { userId: "17841400000000001", username: "casa.do_bem" },
    });

    expect(resultado).toEqual({ tipo: "verificada" });
    expect(await donos(empresa.id)).toEqual([dono.id]);
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).instagramUserId).toBe("17841400000000001");
  });

  it("recusa quando a pessoa entra com outra conta", async () => {
    const pessoa = await criarUsuario();
    const empresa = await criarEmpresa("casa.do_bem");

    const resultado = await processarLoginInstagram({
      empresaId: empresa.id,
      usuarioId: pessoa.id,
      conta: { userId: "1", username: "minha.conta.pessoal" },
    });

    expect(resultado).toEqual({ tipo: "conta_diferente", conectada: "minha.conta.pessoal" });
    expect(await db.reivindicacao.count()).toBe(0);
  });

  it("manda para análise quando o @ passou para outra conta", async () => {
    // O negócio trocou de @ e alguém registrou o @ antigo: o ID não bate mais.
    const pessoa = await criarUsuario();
    const empresa = await criarEmpresa("casa.do_bem", { instagramUserId: "id-original" });

    const resultado = await processarLoginInstagram({
      empresaId: empresa.id,
      usuarioId: pessoa.id,
      conta: { userId: "id-de-outra-pessoa", username: "casa.do_bem" },
    });

    expect(resultado).toEqual({ tipo: "em_analise" });
    expect(await donos(empresa.id)).toEqual([]);
    const pendente = await db.reivindicacao.findFirstOrThrow({ where: { empresaId: empresa.id } });
    expect(pendente.notas).toContain("pode ter mudado de dono");
  });

  it("detecta a mesma conta ligada a outro perfil e, ao aprovar, move a ligação", async () => {
    const dono = await criarUsuario();
    const moderador = await criarUsuario();
    const antigo = await criarEmpresa("nome.antigo", { instagramUserId: "id-123" });
    const novo = await criarEmpresa("nome.novo");

    const resultado = await processarLoginInstagram({
      empresaId: novo.id,
      usuarioId: dono.id,
      conta: { userId: "id-123", username: "nome.novo" },
    });
    expect(resultado).toEqual({ tipo: "em_analise" });

    const pendente = await db.reivindicacao.findFirstOrThrow({ where: { empresaId: novo.id, status: "pendente" } });
    expect(pendente.notas).toContain("@nome.antigo");

    await aprovar({ reivindicacaoId: pendente.id, revisorId: moderador.id });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: novo.id } })).instagramUserId).toBe("id-123");
    expect((await db.empresa.findUniqueOrThrow({ where: { id: antigo.id } })).instagramUserId).toBeNull();
  });
});

describe("documento e moderação", () => {
  const dadosDoNegocio = { cnpj: null, site: null, relacao: "Dona", contato: "(81) 99999-0000", mensagem: null };

  it("aprova na hora quando o negócio ainda não tem dono", async () => {
    const pessoa = await criarUsuario();
    const empresa = await criarEmpresa("sem.dono");

    const pedido = await solicitarPorDocumento({ empresaId: empresa.id, usuarioId: pessoa.id, ...dadosDoNegocio });

    expect(pedido.status).toBe("aprovada");
    expect(pedido.revisadoPorId).toBeNull();
    expect(await donos(empresa.id)).toEqual([pessoa.id]);
    expect(await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).toMatchObject({ status: "verificada", moderacao: "aprovada" });
    expect(await db.registroAuditoria.findFirst({ where: { acao: "reivindicacao.aprovada" } })).toMatchObject({ usuarioId: null });
  });

  it("deixa para a moderação quando o negócio foi tirado do ar", async () => {
    const pessoa = await criarUsuario();
    const empresa = await criarEmpresa("fora.do.ar");
    await db.empresa.update({ where: { id: empresa.id }, data: { moderacao: "rejeitada" } });

    const pedido = await solicitarPorDocumento({ empresaId: empresa.id, usuarioId: pessoa.id, ...dadosDoNegocio });

    expect(pedido.status).toBe("pendente");
    expect(await donos(empresa.id)).toEqual([]);
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).moderacao).toBe("rejeitada");
  });

  it("aprova a fila antiga por ordem de chegada, só nos negócios sem dono e no ar", async () => {
    const [primeira, segunda, terceira, quarta, dono, moderador] = await Promise.all(
      ["Primeira", "Segunda", "Terceira", "Quarta", "Dono", "Moderação"].map((nome) => criarUsuario(nome)),
    );
    const semDono = await criarEmpresa("fila.sem.dono");
    const comDono = await criarEmpresa("fila.com.dono");
    const foraDoAr = await criarEmpresa("fila.fora.do.ar");
    await db.empresaMembro.create({ data: { empresaId: comDono.id, usuarioId: dono.id } });
    await db.empresa.update({ where: { id: foraDoAr.id }, data: { moderacao: "rejeitada" } });

    // Pedidos feitos antes da aprovação automática, que ficaram pendentes.
    const naFila = (empresaId: string, usuarioId: string, minutosAtras: number) =>
      db.reivindicacao.create({
        data: {
          empresaId,
          usuarioId,
          metodo: "documento",
          relacao: "Dona",
          contato: "x",
          criadoEm: new Date(Date.now() - minutosAtras * 60_000),
          expiraEm: new Date(Date.now() + 86_400_000),
        },
      });
    const pedidoDaSegunda = await naFila(semDono.id, segunda.id, 5);
    const pedidoDaPrimeira = await naFila(semDono.id, primeira.id, 10);
    const pedidoDaTerceira = await naFila(comDono.id, terceira.id, 10);
    const pedidoDaQuarta = await naFila(foraDoAr.id, quarta.id, 10);

    expect(await aprovarPendentesSemDono(moderador.id)).toEqual([pedidoDaPrimeira.id]);

    const status = async (id: string) => (await db.reivindicacao.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(pedidoDaPrimeira.id)).toBe("aprovada");
    expect(await status(pedidoDaSegunda.id)).toBe("pendente");
    expect(await status(pedidoDaTerceira.id)).toBe("pendente");
    expect(await status(pedidoDaQuarta.id)).toBe("pendente");
    expect(await donos(semDono.id)).toEqual([primeira.id]);
    expect(await donos(comDono.id)).toEqual([dono.id]);
    expect(await db.registroAuditoria.findFirst({ where: { acao: "reivindicacao.aprovada" } })).toMatchObject({ usuarioId: moderador.id });
  });

  it("guarda CNPJ e site e não deixa duplicar enquanto está em análise", async () => {
    const pessoa = await criarUsuario();
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("ateliê".normalize("NFD").replace(/[̀-ͯ]/g, ""));
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: dono.id } });
    const dados = {
      empresaId: empresa.id,
      usuarioId: pessoa.id,
      cnpj: "11222333000181",
      site: "https://atelie.example.com/",
      relacao: "Sócia",
      contato: "(81) 99999-0000",
      mensagem: null,
    };

    const pedido = await solicitarPorDocumento(dados);

    expect(pedido).toMatchObject({ metodo: "documento", status: "pendente", cnpj: "11222333000181", site: "https://atelie.example.com/" });
    expect(await donos(empresa.id)).toEqual([dono.id]);
    await expect(solicitarPorDocumento(dados)).rejects.toBeInstanceOf(ErroReivindicacao);
  });

  it("recusa com motivo e registra na auditoria", async () => {
    const pessoa = await criarUsuario();
    const moderador = await criarUsuario();
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("loja.x");
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: dono.id } });
    const pedido = await solicitarPorDocumento({ empresaId: empresa.id, usuarioId: pessoa.id, cnpj: null, site: null, relacao: "Dono", contato: "x", mensagem: null });

    await recusar({ reivindicacaoId: pedido.id, revisorId: moderador.id, motivo: "Não conseguimos confirmar." });

    const recusada = await db.reivindicacao.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(recusada.status).toBe("recusada");
    expect(recusada.motivoRecusa).toBe("Não conseguimos confirmar.");
    await expect(aprovar({ reivindicacaoId: pedido.id, revisorId: moderador.id })).rejects.toBeInstanceOf(ErroReivindicacao);
    expect(await db.registroAuditoria.count({ where: { acao: "reivindicacao.recusada" } })).toBe(1);
  });

  it("limita a quantidade de solicitações por dia", async () => {
    const pessoa = await criarUsuario();
    for (let i = 0; i < 10; i++) {
      const empresa = await criarEmpresa(`loja${i}`);
      await iniciarPorCodigoDm(empresa.id, pessoa.id);
    }
    const mais = await criarEmpresa("loja.extra");
    await expect(iniciarPorCodigoDm(mais.id, pessoa.id)).rejects.toThrow(/muitas solicitações/);
  });

  it("não deixa quem já é dono pedir de novo", async () => {
    const dono = await criarUsuario();
    const empresa = await criarEmpresa("loja.y");
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: dono.id } });
    await expect(iniciarPorCodigoDm(empresa.id, dono.id)).rejects.toThrow(/já é dono/);
  });
});
