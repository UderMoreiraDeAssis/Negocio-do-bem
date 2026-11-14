import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { indicarEmpresa, removerFoto, salvarEmpresa, trocarFoto } from "@/acoes/empresas";
import { aprovar, solicitarPorDocumento } from "@/lib/reivindicacao";
import * as armazenamento from "@/lib/armazenamento";
import { trocarFotoDoEmbaixador } from "@/acoes/embaixadores";
import { atualizarPeloInstagram } from "@/lib/embaixadores";
import { aplicarFotoDoInstagram } from "@/lib/fotos-instagram";
import { esquecerPrevias } from "@/lib/previa-instagram";
import { migrarReferenciasFotos } from "@/lib/publicacao-fotos";
import { apagarFoto, limparFotosHistorias } from "@/lib/armazenamento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { ErroFotoDescartada, validarFotosDaHistoria } from "@/lib/ciclo-fotos";
import { db } from "@/lib/db";
import { hrefModeracao, lerFiltros } from "@/lib/moderacao/filtros";
import { listarAuditoria } from "@/lib/moderacao/consultas";

vi.mock("@/lib/auth/sessao", () => ({ exigirUsuario: vi.fn(), exigirModerador: vi.fn(async () => ({ id: "moderacao-teste" })), caminhoSeguro: (valor: string) => valor }));
vi.mock("next/server", async (importar) => ({ ...await importar<typeof import("next/server")>(), after: vi.fn() }));
const barreira = vi.hoisted(() => ({ depoisDeValidar: undefined as (() => Promise<void>) | undefined }));
vi.mock("@/lib/publicacao-fotos", async (importar) => {
  const real = await importar<typeof import("@/lib/publicacao-fotos")>();
  return { ...real, validarReferenciasFotos: async (...args: Parameters<typeof real.validarReferenciasFotos>) => {
    await real.validarReferenciasFotos(...args);
    await barreira.depoisDeValidar?.();
  } };
});
const disco = vi.hoisted(() => ({ readdir: vi.fn(), realpath: vi.fn(), lstat: vi.fn(), unlink: vi.fn(), open: vi.fn(), stat: vi.fn() }));
vi.mock("node:fs/promises", async (importar) => ({ ...await importar<typeof import("node:fs/promises")>(), ...disco }));

const { del, list } = vi.hoisted(() => ({ del: vi.fn<(url: string) => Promise<void>>(async () => {}), list: vi.fn() }));
vi.mock("@/lib/r2-administracao", () => ({
  prepararInventarioHistoriasR2: async () => {
    const objetos = new Map<string, string>();
    let cursor: string | undefined;
    do {
      const pagina = await list({ prefix: "historias/", ...(cursor ? { cursor } : {}) });
      for (const item of pagina.blobs) objetos.set(item.url, item.pathname);
      cursor = pagina.hasMore ? pagina.cursor : undefined;
    } while (cursor);
    return { objetos, excluir: del };
  },
}));

const FOTO = "https://fotos.exemplo.com/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";

async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE "FotoAposentada", "RegistroAuditoria", "Depoimento", "Reivindicacao", "Embaixador", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`,
  );
}

/** Falha se a operação ficar presa esperando uma trava que ela não deveria pedir. */
function comLimite<T>(operacao: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([operacao, new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error("Esperou uma trava")), ms))]);
}

function criarEmpresa(username: string, historia: string) {
  return db.empresa.create({
    data: {
      instagramUsername: username,
      nome: `Negócio ${username}`,
      resumo: "Um negócio do bem",
      categoria: "Serviços",
      cidade: "Recife",
      uf: "PE",
      moderacao: "aprovada",
      historia,
    },
  });
}

async function formularioDaDona(username: string, historia: string) {
  const empresa = await criarEmpresa(username, "");
  const usuario = await db.usuario.create({ data: { nome: "Pessoa de teste", email: `${username}@example.test` } });
  await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: usuario.id, papel: "dono" } });
  vi.mocked(exigirUsuario).mockResolvedValue({ ...usuario, moderador: false, emailConfirmado: false });
  const dados = new FormData();
  for (const [campo, valor] of Object.entries({ empresaId: empresa.id, nome: empresa.nome, categoria: empresa.categoria, municipio: "Recife, PE", resumo: empresa.resumo, historia })) dados.set(campo, valor);
  return { empresa, dados };
}

/** O formulário de reivindicação não envia mais o site: a fotografia entra direto na regra. */
async function pedidoDeReivindicacao(username: string) {
  const empresa = await criarEmpresa(username, "");
  await db.empresa.update({ where: { id: empresa.id }, data: { moderacao: "rejeitada" } });
  const usuario = await db.usuario.create({ data: { nome: "Pessoa solicitante", email: `${username}@example.test` } });
  const solicitar = () =>
    solicitarPorDocumento({ empresaId: empresa.id, usuarioId: usuario.id, cnpj: null, site: FOTO, relacao: "Sou dona", contato: "contato@example.test", mensagem: null });
  return { empresa, usuario, solicitar };
}

async function publicacaoDeSite(caminho: "edicao" | "indicacao" | "reivindicacao") {
  if (caminho === "edicao") {
    const { dados } = await formularioDaDona("corrida.site.edicao", "");
    dados.set("site", FOTO);
    return { publicar: () => salvarEmpresa(undefined, dados) };
  }
  if (caminho === "reivindicacao") {
    const { solicitar } = await pedidoDeReivindicacao("corrida.site.reivindicacao");
    // Igual a salvarEmpresa: sucesso termina em redirect, recusa devolve o erro do campo.
    return {
      publicar: () => solicitar().then(
        () => { throw new Error("NEXT_REDIRECT"); },
        (erro: unknown) => {
          if (erro instanceof ErroFotoDescartada) return { erros: { site: erro.message }, valores: { site: FOTO } };
          throw erro;
        },
      ),
    };
  }
  const usuario = await db.usuario.create({ data: { nome: "Pessoa indicadora", email: "indicacao-site@example.test" } });
  vi.mocked(exigirUsuario).mockResolvedValue({ ...usuario, moderador: false, emailConfirmado: true });
  const dados = new FormData();
  for (const [campo, valor] of Object.entries({
    nome: "Negócio do bairro", categoria: "Serviços", municipio: "Recife, PE", resumo: "Um negócio do bem do bairro",
    semInstagram: "sim", souDono: "sim", site: FOTO, whatsapp: "5511999999999", telefoneComercial: "5511999999999", telefoneDoDono: "5511999999999", emailDoDono: "dona@example.test",
  })) dados.set(campo, valor);
  return { publicar: () => indicarEmpresa(undefined, dados) };
}

async function esperarTravaDeFotos() {
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    const [estado] = await db.$queryRaw<{ bloqueada: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS bloqueada`;
    if (estado.bloqueada) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("A operação não esperou a trava das fotos.");
}

beforeEach(async () => {
  barreira.depoisDeValidar = undefined;
  await limparBanco();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://fotos.exemplo.com");
  vi.stubEnv("FOTOS_R2_BUCKET", "fotos-teste");
  vi.stubEnv("FOTOS_DOMINIO_EXCLUSIVO", "confirmado");
  disco.readdir.mockResolvedValue([]);
  disco.realpath.mockImplementation(async (destino: string) => destino);
  disco.lstat.mockResolvedValue({ dev: 1, ino: 1, isDirectory: () => true, isFile: () => true });
  disco.stat.mockResolvedValue({ dev: 1, ino: 1 });
  disco.open.mockResolvedValue({ fd: 7, stat: async () => ({ dev: 1, ino: 1 }), close: async () => {} });
  disco.unlink.mockResolvedValue(undefined);
  vi.mocked(del).mockResolvedValue();
  vi.mocked(list).mockResolvedValue({
    blobs: [{ url: FOTO, pathname: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg", size: 3, uploadedAt: new Date(), downloadUrl: FOTO, etag: "teste" }],
    hasMore: false,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("ciclo das fotos", () => {
  it("preserva foto publicada somente como site pela edição real", async () => {
    const { empresa, dados } = await formularioDaDona("site.publicado", "");
    dados.set("site", FOTO);
    await expect(salvarEmpresa(undefined, dados)).rejects.toThrow("NEXT_REDIRECT");
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).site).toBe(FOTO);
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("a edição real recusa site aposentado sem perder os campos", async () => {
    const { empresa, dados } = await formularioDaDona("site.aposentado", "");
    dados.set("site", FOTO);
    await limparFotosHistorias([FOTO], true);
    expect(await salvarEmpresa(undefined, dados)).toMatchObject({ erros: { site: expect.any(String) }, valores: { site: FOTO } });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).site).toBeNull();
  });

  it("preserva foto publicada somente no site de uma reivindicação real", async () => {
    const { empresa, solicitar } = await pedidoDeReivindicacao("site.reivindicacao");
    await solicitar();
    expect(await db.reivindicacao.findFirst({ where: { empresaId: empresa.id } })).toMatchObject({ site: FOTO });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("a reivindicação real recusa site aposentado sem criar o pedido", async () => {
    const { solicitar } = await pedidoDeReivindicacao("site.reivindicacao.aposentada");
    await limparFotosHistorias([FOTO], true);
    await expect(solicitar()).rejects.toBeInstanceOf(ErroFotoDescartada);
    expect(await db.reivindicacao.count()).toBe(0);
  });

  it.each(["edicao", "indicacao", "reivindicacao"] as const)("site confirma antes do descarte concorrente: %s", async (caminho) => {
    const { publicar } = await publicacaoDeSite(caminho);
    const validada = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    barreira.depoisDeValidar = async () => { validada.resolve(); await liberar.promise; };
    const publicacao = publicar().catch((erro: Error) => erro);
    await validada.promise;
    const limpeza = limparFotosHistorias([FOTO], true);
    try {
      await esperarTravaDeFotos();
    } finally {
      liberar.resolve();
    }
    expect(await publicacao).toMatchObject({ message: "NEXT_REDIRECT" });
    expect(await limpeza).toEqual([{ url: FOTO, status: "preservada" }]);
    const referencias = await db.empresa.count({ where: { site: FOTO } }) + await db.reivindicacao.count({ where: { site: FOTO } });
    expect(referencias).toBe(1);
    expect(del).not.toHaveBeenCalled();
  });

  it.each(["edicao", "indicacao", "reivindicacao"] as const)("descarte impede publicar site antes da resposta do armazenamento: %s", async (caminho) => {
    const { publicar } = await publicacaoDeSite(caminho);
    const iniciou = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    vi.mocked(del).mockImplementationOnce(async () => { iniciou.resolve(); await liberar.promise; });
    const limpeza = limparFotosHistorias([FOTO], true);
    await iniciou.promise;
    try {
      expect(await publicar()).toMatchObject({ erros: { site: expect.any(String) }, valores: { site: FOTO } });
      expect(await db.empresa.count({ where: { site: FOTO } })).toBe(0);
      expect(await db.reivindicacao.count({ where: { site: FOTO } })).toBe(0);
    } finally {
      liberar.resolve();
    }
    expect(await limpeza).toEqual([{ url: FOTO, status: "descartada" }]);
  });

  it("a aprovação mantém o site salvo no pedido sem copiá-lo para a empresa", async () => {
    const { empresa, solicitar } = await pedidoDeReivindicacao("site.aprovacao");
    await solicitar();
    const pedido = await db.reivindicacao.findFirstOrThrow({ where: { empresaId: empresa.id } });
    await aprovar({ reivindicacaoId: pedido.id, revisorId: null });
    expect((await db.reivindicacao.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe("aprovada");
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).site).toBeNull();
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("a reivindicação adquire a trava de fotos antes da trava da pessoa", async () => {
    const { usuario, solicitar } = await pedidoDeReivindicacao("site.ordem.travas");
    const presa = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    const pessoaPresa = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuario.id} FOR NO KEY UPDATE`;
      presa.resolve();
      await liberar.promise;
    });
    await presa.promise;
    const publicacao = solicitar().catch((erro: Error) => erro);
    try {
      let fotoAntesDaPessoa = false;
      for (let tentativa = 0; tentativa < 100 && !fotoAntesDaPessoa; tentativa++) {
        const [estado] = await db.$queryRaw<{ correta: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.locktype = 'advisory' AND l.granted AND a.datname = current_database() AND a.wait_event_type = 'Lock' AND a.query LIKE '%FOR NO KEY UPDATE%') AS correta`;
        fotoAntesDaPessoa = estado.correta;
        if (!fotoAntesDaPessoa) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(fotoAntesDaPessoa).toBe(true);
    } finally {
      liberar.resolve();
      await pessoaPresa;
    }
    expect(await publicacao).toMatchObject({ site: FOTO });
  });

  it("não apaga uma foto usada na história de outro negócio", async () => {
    await criarEmpresa("outra.loja", `![Nossa foto](${FOTO})`);

    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);

    expect(del).not.toHaveBeenCalled();
  });

  it.each([
    { oculta: true },
    { moderacao: "pendente" },
    { moderacao: "rejeitada" },
  ])("preserva referências mesmo fora do diretório: %j", async (estado) => {
    const empresa = await criarEmpresa("fora.diretorio", `![Foto][imagem]\n\n[imagem]: ${FOTO}?x=1#foto`);
    await db.empresa.update({ where: { id: empresa.id }, data: estado });

    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("descarta upload nunca salvo apenas depois do registro durável", async () => {
    vi.mocked(del).mockImplementationOnce(async () => {
      expect(await db.fotoAposentada.count({ where: { dominio: "https://fotos.exemplo.com", chave: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg" } })).toBe(1);
      expect(await db.registroAuditoria.findFirst({ where: { acao: "foto.descarte_iniciado", alvoId: FOTO } })).toMatchObject({ alvoTipo: "foto", usuarioId: null });
    });

    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "descartada" }]);
    expect(del).toHaveBeenCalledExactlyOnceWith(FOTO);
  });

  it("filtra o evento R2 criado pelo descarte no histórico real", async () => {
    await limparFotosHistorias([FOTO], true);
    const registro = await db.registroAuditoria.findFirstOrThrow({ where: { acao: "foto.descarte_iniciado", alvoId: FOTO } });
    await db.registroAuditoria.create({ data: { acao: "empresa.editada", alvoTipo: "empresa", alvoId: "outraempresa" } });
    const href = hrefModeracao("auditoria", { alvo: `${registro.alvoTipo}:${registro.alvoId}` });
    const params = Object.fromEntries(new URL(href, "https://site.exemplo.com").searchParams);
    const filtros = lerFiltros(params);
    expect(filtros.alvo).toEqual({ tipo: "foto", id: FOTO });
    const pagina = await listarAuditoria(filtros);
    expect(pagina.total).toBe(1);
    expect(pagina.itens.map((item) => item.id)).toEqual([registro.id]);
    expect(pagina.itens[0]!.alvo).toMatchObject({ rotulo: "Foto historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg", href: null });
  });

  it("só descarta uma foto retirada quando nenhuma outra história a utiliza", async () => {
    const primeira = await criarEmpresa("primeira.loja", `![Foto](${FOTO})`);
    const segunda = await criarEmpresa("segunda.loja", `![Foto](${FOTO})`);
    await db.empresa.update({ where: { id: primeira.id }, data: { historia: "Sem foto" } });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    await db.empresa.update({ where: { id: segunda.id }, data: { historia: "Sem foto" } });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "descartada" }]);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it.each([
    "![Foto](//outra.exemplo/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg)",
    "![Foto](http://blob.exemplo/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg)",
    "![Foto](https://proxy.exemplo/?url=historias%252Faaaaaaaaaaaaaaaaaaaaaaaa.jpg)",
  ])("preserva chave citada por outra origem: %s", async (historia) => {
    await criarEmpresa("referencia.alternativa", historia);
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("recusa uma referência alternativa para a chave descartada", async () => {
    await limparFotosHistorias([FOTO], true);
    await expect(db.$transaction((tx) => validarFotosDaHistoria(tx, "![Foto](//blob.exemplo/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg)")))
      .rejects.toBeInstanceOf(ErroFotoDescartada);
  });

  it("preserva a chave citada por fotoUrl em outra origem", async () => {
    const empresa = await criarEmpresa("perfil.alternativo", "");
    await db.empresa.update({ where: { id: empresa.id }, data: { fotoUrl: "http://blob.exemplo/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg" } });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("não grava eventos nem exclui no diagnóstico", async () => {
    expect(await limparFotosHistorias()).toEqual([{ url: FOTO, status: "candidata" }]);
    expect(await db.registroAuditoria.count()).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("bloqueia exclusões enquanto a topologia não estiver confirmada", async () => {
    vi.stubEnv("FOTOS_DOMINIO_EXCLUSIVO", "");
    await expect(limparFotosHistorias([FOTO], true)).rejects.toThrow("exclusão está bloqueada");
    expect(await apagarFoto(FOTO)).toBe("bloqueada");
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(await db.registroAuditoria.count()).toBe(0);
  });

  it.each([
    FOTO.replace("/historias/", "/perfis/"),
    FOTO.replace("fotos.exemplo.com", "outro.exemplo.com"),
    "/enviados/historias/%2e%2e/perfis/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
  ])("não exclui seleção fora do inventário: %s", async (url) => {
    await expect(limparFotosHistorias([url], true)).rejects.toThrow("fora do inventário");
    expect(del).not.toHaveBeenCalled();
  });

  it("não trata falta de inventário como autorização para exclusão", async () => {
    vi.mocked(list).mockRejectedValueOnce(new Error("Falha simulada de inventário"));
    await expect(limparFotosHistorias([FOTO], true)).rejects.toThrow("Falha simulada");
    expect(del).not.toHaveBeenCalled();
  });

  it("exige seleção explícita antes de aplicar", async () => {
    await expect(limparFotosHistorias([], true)).rejects.toThrow("Escolha explicitamente");
    expect(del).not.toHaveBeenCalled();
  });

  it("percorre as páginas do inventário", async () => {
    vi.mocked(list)
      .mockResolvedValueOnce({ blobs: [], hasMore: true, cursor: "segunda-pagina" })
      .mockResolvedValueOnce({ blobs: [{ url: FOTO, pathname: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg", size: 3, uploadedAt: new Date(), downloadUrl: FOTO, etag: "teste" }], hasMore: false });
    expect(await limparFotosHistorias()).toEqual([{ url: FOTO, status: "candidata" }]);
    expect(list).toHaveBeenNthCalledWith(2, { prefix: "historias/", cursor: "segunda-pagina" });
  });

  it("não exclui se a escrita do registro falhar", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION falhar_descarte_item9() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada de aposentadoria'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER falhar_descarte_item9 BEFORE INSERT ON "FotoAposentada" FOR EACH ROW EXECUTE FUNCTION falhar_descarte_item9()`);
    try {
      await expect(limparFotosHistorias([FOTO], true)).rejects.toThrow();
      expect(del).not.toHaveBeenCalled();
      expect(await db.registroAuditoria.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER falhar_descarte_item9 ON "FotoAposentada"`);
      await db.$executeRawUnsafe(`DROP FUNCTION falhar_descarte_item9()`);
    }
  });

  it("não confirma exclusão quando o banco falha depois do armazenamento", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION falhar_confirmacao_foto82() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada de confirmacao'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER falhar_confirmacao_foto82 BEFORE UPDATE ON "FotoAposentada" FOR EACH ROW EXECUTE FUNCTION falhar_confirmacao_foto82()`);
    try {
      expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "falha" }]);
      expect(del).toHaveBeenCalledExactlyOnceWith(FOTO);
      expect(await db.fotoAposentada.findFirst()).toMatchObject({ chave: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg", confirmadaEm: null });
      await expect(db.$transaction((tx) => validarFotosDaHistoria(tx, `![Foto](${FOTO})`))).rejects.toBeInstanceOf(ErroFotoDescartada);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER falhar_confirmacao_foto82 ON "FotoAposentada"`);
      await db.$executeRawUnsafe(`DROP FUNCTION falhar_confirmacao_foto82()`);
    }
  });

  it("uma marca local não autoriza excluir do armazenamento remoto", async () => {
    const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    await db.fotoAposentada.create({ data: { dominio: `local:${path.resolve("public/enviados")}`, chave: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg" } });
    await expect(limparFotosHistorias([url], true)).rejects.toThrow("fora do inventário");
    expect(del).not.toHaveBeenCalled();
  });

  it("mantém a marca depois de uma exclusão incerta e permite repetir o descarte", async () => {
    vi.mocked(del).mockRejectedValueOnce(new Error("Resposta perdida depois do envio"));
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "falha" }]);
    await expect(db.$transaction((tx) => validarFotosDaHistoria(tx, `![Foto](${FOTO})`))).rejects.toBeInstanceOf(ErroFotoDescartada);
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "descartada" }]);
    expect(await db.fotoAposentada.count({ where: { dominio: "https://fotos.exemplo.com", chave: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg" } })).toBe(1);
  });

  it("recusa a URL aposentada na ação mesmo sem o histórico de auditoria", async () => {
    const empresa = await criarEmpresa("dona.loja", "História anterior");
    const usuario = await db.usuario.create({ data: { nome: "Pessoa de teste", email: "foto-item9@example.test", senhaHash: "hash-sintetico" } });
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: usuario.id, papel: "dono" } });
    vi.mocked(exigirUsuario).mockResolvedValue({ ...usuario, moderador: false, emailConfirmado: false });
    await limparFotosHistorias([FOTO], true);
    await db.registroAuditoria.deleteMany();
    const historia = `Meu texto continua aqui. ![Foto](${FOTO})`;
    const dados = new FormData();
    for (const [campo, valor] of Object.entries({ empresaId: empresa.id, nome: empresa.nome, categoria: empresa.categoria, municipio: "Recife, PE", resumo: empresa.resumo, historia, site: "", whatsapp: "", emailContato: "" })) dados.set(campo, valor);

    expect(await salvarEmpresa(undefined, dados)).toMatchObject({
      erros: { historia: expect.stringContaining("entrou em descarte") },
      valores: { historia },
    });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).historia).toBe("História anterior");
  });

  it("a troca de perfil rejeita uma chave aposentada na mesma transação", async () => {
    const { empresa, dados } = await formularioDaDona("perfil.aposentado", "");
    await limparFotosHistorias([FOTO], true);
    vi.spyOn(armazenamento, "guardarFoto").mockResolvedValueOnce(FOTO);
    dados.set("foto", new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg"));
    expect(await trocarFoto(undefined, dados)).toMatchObject({ erro: expect.stringContaining("entrou em descarte") });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).fotoUrl).toBeNull();
  });

  it("o caminho do Instagram rejeita uma chave aposentada", async () => {
    const empresa = await criarEmpresa("instagram.aposentado", "");
    await limparFotosHistorias([FOTO], true);
    vi.spyOn(armazenamento, "guardarFoto").mockResolvedValueOnce(FOTO);
    await expect(aplicarFotoDoInstagram(empresa.id, {
      arquivo: new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg"), tipo: "image/jpeg",
    })).rejects.toBeInstanceOf(ErroFotoDescartada);
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).fotoUrl).toBeNull();
  });

  it("preserva uma chave de historias/ usada como foto de um embaixador", async () => {
    await db.embaixador.create({ data: { instagramUsername: "embaixadora.foto", nome: "Pessoa embaixadora", uf: "PE", fotoUrl: FOTO } });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(await db.fotoAposentada.count()).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("a troca de foto do embaixador rejeita uma chave aposentada sem gravá-la", async () => {
    const embaixador = await db.embaixador.create({ data: { instagramUsername: "embaixador.troca", nome: "Pessoa embaixadora", uf: "PE" } });
    await limparFotosHistorias([FOTO], true);
    vi.spyOn(armazenamento, "guardarFoto").mockResolvedValueOnce(FOTO);
    const dados = new FormData();
    dados.set("embaixadorId", embaixador.id);
    dados.set("foto", new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg"));
    expect(await trocarFotoDoEmbaixador(undefined, dados)).toMatchObject({ erro: expect.stringContaining("entrou em descarte") });
    expect((await db.embaixador.findUniqueOrThrow({ where: { id: embaixador.id } })).fotoUrl).toBeNull();
    expect(await db.registroAuditoria.count({ where: { alvoId: embaixador.id } })).toBe(0);
  });

  it("a consulta do Instagram rejeita uma chave aposentada no embaixador sem gravá-la", async () => {
    const embaixador = await db.embaixador.create({ data: { instagramUsername: "embaixador.instagram", nome: "Pessoa embaixadora", uf: "PE" } });
    await limparFotosHistorias([FOTO], true);
    vi.spyOn(armazenamento, "guardarFoto").mockResolvedValueOnce(FOTO);
    vi.stubEnv("META_ACCESS_TOKEN", "token-de-teste");
    vi.stubEnv("META_IG_USER_ID", "17841400000000000");
    esquecerPrevias();
    const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).startsWith("https://graph.facebook.com/")
      ? Response.json({ business_discovery: { name: "x", followers_count: 10, profile_picture_url: "https://scontent.cdninstagram.com/v/foto.webp" } })
      : new Response(webp, { status: 200, headers: { "content-type": "image/webp" } })));
    try {
      await expect(atualizarPeloInstagram(embaixador.id)).rejects.toBeInstanceOf(ErroFotoDescartada);
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await db.embaixador.findUniqueOrThrow({ where: { id: embaixador.id } })).fotoUrl).toBeNull();
    expect(await db.registroAuditoria.count({ where: { alvoId: embaixador.id } })).toBe(0);
  });

  it.each(["historia", "fotoUrl"])("o CAS da migração rejeita %s aposentada", async (campo) => {
    const empresa = await criarEmpresa("migracao.aposentada", "Texto anterior");
    await limparFotosHistorias([FOTO], true);
    const anterior = { id: empresa.id, historia: empresa.historia, fotoUrl: empresa.fotoUrl };
    const nova = { historia: campo === "historia" ? `![Foto](${FOTO})` : empresa.historia, fotoUrl: campo === "fotoUrl" ? FOTO : null };
    await expect(migrarReferenciasFotos(db, anterior, nova)).rejects.toBeInstanceOf(ErroFotoDescartada);
    expect(await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).toMatchObject(anterior);
  });

  it("o CAS da migração não sobrescreve uma edição concorrente", async () => {
    const empresa = await criarEmpresa("migracao.cas", "Texto anterior");
    const anterior = { id: empresa.id, historia: empresa.historia, fotoUrl: empresa.fotoUrl };
    await db.empresa.update({ where: { id: empresa.id }, data: { historia: "Texto novo" } });
    expect(await migrarReferenciasFotos(db, anterior, { historia: "Texto migrado", fotoUrl: null })).toEqual({ count: 0 });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).historia).toBe("Texto novo");
  });

  it("a remoção de perfil preserva a foto que outra história utiliza", async () => {
    const perfil = FOTO.replace("/historias/", "/perfis/");
    const empresa = await criarEmpresa("perfil.dono", "");
    await db.empresa.update({ where: { id: empresa.id }, data: { fotoUrl: perfil } });
    await criarEmpresa("historia.compartilhada", `![Foto](${perfil})`);
    const usuario = await db.usuario.create({ data: { nome: "Pessoa de teste", email: "perfil-item9@example.test", senhaHash: "hash-sintetico" } });
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: usuario.id, papel: "dono" } });
    vi.mocked(exigirUsuario).mockResolvedValue({ ...usuario, moderador: false, emailConfirmado: false });
    const dados = new FormData();
    dados.set("empresaId", empresa.id);

    await expect(removerFoto(dados)).rejects.toThrow("NEXT_REDIRECT");
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).fotoUrl).toBeNull();
    expect(del).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(await db.fotoAposentada.count()).toBe(0);
  });

  it("preserva a foto que ainda é usada como perfil", async () => {
    const empresa = await criarEmpresa("perfil.atual", "");
    await db.empresa.update({ where: { id: empresa.id }, data: { fotoUrl: FOTO } });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("não exclui quando o banco falha de verdade antes de decidir o descarte", async () => {
    // A tabela some do caminho: a consulta das referências falha no PostgreSQL real.
    await db.$executeRawUnsafe(`ALTER TABLE "Empresa" RENAME TO "Empresa_indisponivel"`);
    try {
      await expect(limparFotosHistorias([FOTO], true)).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "Empresa_indisponivel" RENAME TO "Empresa"`);
    }
    expect(del).not.toHaveBeenCalled();
    expect(await db.registroAuditoria.count()).toBe(0);
  });

  it("preserva a foto citada pela história de um negócio oculto, pendente ou rejeitado", async () => {
    const oculto = await criarEmpresa("historia.oculta", `Nossa vitrine.\n\n![Vitrine](${FOTO})`);
    await db.empresa.update({ where: { id: oculto.id }, data: { oculta: true } });
    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);

    for (const moderacao of ["pendente", "rejeitada"]) {
      await db.empresa.update({ where: { id: oculto.id }, data: { oculta: false, moderacao } });
      expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "preservada" }]);
    }
    expect(del).not.toHaveBeenCalled();
    expect(await db.registroAuditoria.count()).toBe(0);
  });

  it("registra no log a falha de exclusão da história", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(del).mockRejectedValueOnce(new Error("Resposta perdida depois do envio"));

    expect(await limparFotosHistorias([FOTO], true)).toEqual([{ url: FOTO, status: "falha" }]);

    expect(erro).toHaveBeenCalledWith(expect.stringContaining("Não foi possível apagar a foto"), FOTO, expect.any(Error));
  });

  it("o diagnóstico não espera a trava dos salvamentos", async () => {
    const liberar = Promise.withResolvers<void>();
    const presa = Promise.withResolvers<void>();
    const trava = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7346019)`;
      presa.resolve();
      await liberar.promise;
    });
    await presa.promise;
    try {
      expect(await comLimite(limparFotosHistorias())).toEqual([{ url: FOTO, status: "candidata" }]);
    } finally {
      liberar.resolve();
      await trava;
    }
  });

  it("salvar uma história sem fotos não espera a trava", async () => {
    const liberar = Promise.withResolvers<void>();
    const presa = Promise.withResolvers<void>();
    const trava = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7346019)`;
      presa.resolve();
      await liberar.promise;
    });
    await presa.promise;
    try {
      await comLimite(db.$transaction((tx) => validarFotosDaHistoria(tx, "Uma história só com texto e [um link](https://exemplo.com).")));
    } finally {
      liberar.resolve();
      await trava;
    }
  });

  it("a transação do descarte tem um limite de tempo explícito", async () => {
    const espiao = vi.spyOn(db, "$transaction");
    await limparFotosHistorias([FOTO], true);
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(espiao.mock.calls[0]![1]).toEqual({ isolationLevel: "ReadCommitted", maxWait: expect.any(Number), timeout: expect.any(Number) });
  });

  it("mantém diagnóstico e recusa exclusão local fora do Linux", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.readdir.mockResolvedValue([{ name: "aaaaaaaaaaaaaaaaaaaaaaaa.jpg", isFile: () => true }]);
    const plataforma = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
      expect(await limparFotosHistorias([url])).toEqual([{ url, status: "candidata" }]);
      await expect(limparFotosHistorias([url], true)).rejects.toThrow("exclusão local exige Linux");
      expect(await db.fotoAposentada.count()).toBe(0);
      expect(disco.unlink).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", plataforma);
    }
  });

  it("ignora links simbólicos no inventário local", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.readdir.mockResolvedValue([{ name: "aaaaaaaaaaaaaaaaaaaaaaaa.jpg", isFile: () => false }]);
    expect(await limparFotosHistorias()).toEqual([]);
    expect(disco.unlink).not.toHaveBeenCalled();
  });

  it("não segue uma pasta local que é link simbólico", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.realpath.mockResolvedValue(path.join(process.cwd(), ".nott", "fora-do-inventario"));
    expect(await limparFotosHistorias()).toEqual([]);
    expect(disco.readdir).not.toHaveBeenCalled();
    expect(disco.unlink).not.toHaveBeenCalled();
  });

  it("não apaga um link colocado depois do inventário", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.readdir.mockResolvedValue([{ name: "aaaaaaaaaaaaaaaaaaaaaaaa.jpg", isFile: () => true }]);
    let consultas = 0;
    disco.lstat.mockImplementation(async (destino: string) => {
      if (destino.endsWith(".jpg")) {
        consultas++;
        return { dev: 1, ino: 1, isDirectory: () => false, isFile: () => consultas === 1 };
      }
      return { dev: 1, ino: 1, isDirectory: () => true, isFile: () => false };
    });
    const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    expect(await limparFotosHistorias([url], true)).toEqual([{ url, status: "falha" }]);
    expect(disco.unlink).not.toHaveBeenCalled();
    expect((await db.fotoAposentada.findFirstOrThrow()).confirmadaEm).toBeNull();
  });

  it("recusa excluir um arquivo substituído após o inventário", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.readdir.mockResolvedValue([{ name: "aaaaaaaaaaaaaaaaaaaaaaaa.jpg", isFile: () => true }]);
    let consultas = 0;
    disco.lstat.mockImplementation(async (destino: string) => {
      if (destino.endsWith(".jpg")) {
        consultas++;
        return { dev: 1, ino: consultas === 1 ? 1 : 2, isDirectory: () => false, isFile: () => true };
      }
      return { dev: 1, ino: 1, isDirectory: () => true, isFile: () => false };
    });
    const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    expect(await limparFotosHistorias([url], true)).toEqual([{ url, status: "falha" }]);
    expect(disco.unlink).not.toHaveBeenCalled();
    expect((await db.fotoAposentada.findFirstOrThrow()).confirmadaEm).toBeNull();
  });

  it("recusa apagar arquivo reaparecido quando só existe marca de aposentadoria", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    await db.fotoAposentada.create({
      data: { dominio: `local:${path.resolve("public/enviados")}`, chave: "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg" },
    });
    disco.readdir.mockResolvedValue([]);
    disco.lstat.mockImplementation(async (destino: string) => ({
      dev: 1, ino: 9, isDirectory: () => !destino.endsWith(".jpg"), isFile: () => destino.endsWith(".jpg"),
    }));
    expect(await limparFotosHistorias([url], true)).toEqual([{ url, status: "falha" }]);
    expect(disco.unlink).not.toHaveBeenCalled();
    expect((await db.fotoAposentada.findFirstOrThrow()).confirmadaEm).toBeNull();
  });

  it("a ausência depois do inventário confirma o descarte sem liberar a URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.readdir.mockResolvedValue([{ name: "aaaaaaaaaaaaaaaaaaaaaaaa.jpg", isFile: () => true }]);
    disco.unlink.mockImplementationOnce(async () => {
      disco.lstat.mockImplementation(async (destino: string) => {
        if (destino.endsWith(".jpg")) throw Object.assign(new Error("Arquivo sintético já ausente"), { code: "ENOENT" });
        return { dev: 1, ino: 1, isDirectory: () => true, isFile: () => true };
      });
      throw Object.assign(new Error("Arquivo sintético já ausente"), { code: "ENOENT" });
    });
    const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    expect(await limparFotosHistorias([url], true)).toEqual([{ url, status: "descartada" }]);
    await expect(db.$transaction((tx) => validarFotosDaHistoria(tx, `![Foto](${url})`))).rejects.toBeInstanceOf(ErroFotoDescartada);
  });

  it.each(["ausente", "presente", "inacessivel", "identidade"])("fecha os descritores locais após a confirmação: %s", async (caso) => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    disco.readdir.mockResolvedValue([{ name: "aaaaaaaaaaaaaaaaaaaaaaaa.jpg", isFile: () => true }]);
    let removido = false;
    let ino = 1;
    const fechamentos: ReturnType<typeof vi.fn>[] = [];
    disco.open.mockImplementation(async () => {
      if (caso === "inacessivel" && fechamentos.length === 6) {
        throw Object.assign(new Error("Synthetic parent access failure."), { code: "EACCES" });
      }
      const identidade = { dev: 1, ino };
      const close = vi.fn(async () => {});
      fechamentos.push(close);
      return { fd: 100 + fechamentos.length, stat: async () => identidade, close };
    });
    disco.stat.mockImplementation(async () => ({ dev: 1, ino }));
    disco.lstat.mockImplementation(async (destino: string) => {
      if (destino.endsWith(".jpg") && removido && caso !== "presente") {
        throw Object.assign(new Error("Synthetic file is absent."), { code: "ENOENT" });
      }
      return { dev: 1, ino, isDirectory: () => true, isFile: () => true };
    });
    disco.unlink.mockImplementation(async () => { removido = true; if (caso === "identidade") ino = 2; });
    const url = "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    expect(await limparFotosHistorias([url], true)).toEqual([{ url, status: caso === "ausente" ? "descartada" : "falha" }]);
    expect(fechamentos).toHaveLength(caso === "inacessivel" ? 6 : 8);
    for (const fechar of fechamentos) expect(fechar).toHaveBeenCalledExactlyOnceWith();
    const aposentadoria = await db.fotoAposentada.findFirstOrThrow();
    if (caso === "ausente") expect(aposentadoria.confirmadaEm).toBeInstanceOf(Date);
    else expect(aposentadoria.confirmadaEm).toBeNull();
    expect(disco.unlink).toHaveBeenCalledTimes(1);
  });

  it("o salvamento que confirmou primeiro protege a foto da limpeza concorrente", async () => {
    const { empresa, dados } = await formularioDaDona("corrida.salvar", `![Foto](${FOTO})`);
    const pronto = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    barreira.depoisDeValidar = async () => { pronto.resolve(); await liberar.promise; };
    const salvamento = salvarEmpresa(undefined, dados).catch((erro: Error) => erro);
    await pronto.promise;
    const limpeza = limparFotosHistorias([FOTO], true);
    try {
      let bloqueada = false;
      for (let tentativa = 0; tentativa < 100 && !bloqueada; tentativa++) {
        const [estado] = await db.$queryRaw<{ bloqueada: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS bloqueada`;
        bloqueada = estado.bloqueada;
        if (!bloqueada) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(bloqueada).toBe(true);
    } finally {
      liberar.resolve();
      await salvamento;
    }
    expect(await salvamento).toMatchObject({ message: "NEXT_REDIRECT" });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).historia).toBe(`![Foto](${FOTO})`);
    expect(await limpeza).toEqual([{ url: FOTO, status: "preservada" }]);
    expect(del).not.toHaveBeenCalled();
  });

  it("recusa o descarte enquanto escritores antigos ainda podem retomar", async () => {
    const empresa = await criarEmpresa("corrida.legada", "");
    const historia = "![foto](//fotos.exemplo.com/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg)";
    vi.stubEnv("FOTOS_DOMINIO_EXCLUSIVO", "");
    await expect(limparFotosHistorias([FOTO], true)).rejects.toThrow("exclusão está bloqueada");
    // An old writer bypasses admission. Deployment must remove its write access first.
    await db.empresa.update({ where: { id: empresa.id }, data: { historia } });
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).historia).toBe(historia);
    expect(await db.fotoAposentada.count()).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("o descarte confirmado impede salvar antes da resposta do armazenamento", async () => {
    const historia = `![Foto](//fotos.exemplo.com/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg)`;
    const { empresa, dados } = await formularioDaDona("corrida.descartar", historia);
    const iniciado = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    vi.mocked(del).mockImplementationOnce(async () => {
      iniciado.resolve();
      await liberar.promise;
    });
    const limpeza = limparFotosHistorias([FOTO], true);
    await iniciado.promise;
    try {
      expect(await salvarEmpresa(undefined, dados)).toMatchObject({
        erros: { historia: expect.stringContaining("entrou em descarte") }, valores: { historia },
      });
      expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).historia).toBe("");
    } finally {
      liberar.resolve();
    }
    expect(await limpeza).toEqual([{ url: FOTO, status: "descartada" }]);
  });
});
