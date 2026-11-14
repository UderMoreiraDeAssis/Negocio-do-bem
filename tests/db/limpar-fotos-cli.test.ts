import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { URL_BANCO_TESTE } from "../banco-de-teste";

const executar = promisify(execFile);

/** Roda o comando como o `npm run fotos:limpar`, só com o ambiente que o teste dá. */
async function rodar(argumentos: string[], ambiente: Record<string, string> = {}, diretorio = process.cwd()) {
  try {
    const { stdout, stderr } = await executar(
      process.execPath,
      [...(ambiente.R2_TESTE_API ? ["--import", path.resolve("tests/apoio/r2-cli/preload.mjs")] : []),
        ...(ambiente.LOCAL_TESTE_TROCA ? ["--import", path.resolve("tests/apoio/armazenamento-local/preload.mjs")] : []),
        "--conditions=react-server", "--import", path.resolve("node_modules/tsx/dist/loader.mjs"), path.resolve("scripts/limpar-fotos-historias.ts"), ...argumentos],
      {
        cwd: diretorio,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", DOTENV_CONFIG_PATH: "/dev/null", TSX_TSCONFIG_PATH: path.resolve("tsconfig.json"), DATABASE_URL: URL_BANCO_TESTE, ...ambiente },
      },
    );
    return { codigo: 0, stdout, stderr };
  } catch (erro) {
    const falha = erro as { code: number; stdout: string; stderr: string };
    return { codigo: falha.code, stdout: falha.stdout, stderr: falha.stderr };
  }
}

describe("comando fotos:limpar", () => {
  it("diz qual armazenamento e qual banco leu", async () => {
    const r = await rodar(["listar"]);

    expect(r.codigo).toBe(0);
    expect(r.stdout).toContain("Armazenamento lido: pasta local");
    expect(r.stdout).toContain("Banco lido:");
  }, 60_000);

  it("mostra o motivo do erro, não só uma frase genérica", async () => {
    const r = await rodar(["listar", "https://abc.public.blob.vercel-storage.com/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg"]);

    expect(r.codigo).toBe(1);
    expect(r.stderr).toContain("A seleção contém foto fora do inventário de histórias.");
    expect(r.stdout).toContain("Armazenamento lido: pasta local");
  }, 60_000);

  it("mostra o motivo quando o banco não responde", async () => {
    const r = await rodar(["listar"], { DATABASE_URL: "postgresql://postgres@127.0.0.1:1/inexistente" });

    expect(r.codigo).toBe(1);
    expect(r.stderr).toMatch(/reach database server|ECONNREFUSED/i);
  }, 60_000);
});


const chave = "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
const foto = `https://fotos.exemplo.com/${chave}`;
const requisicoes: { metodo: string; caminho: string; catalogo?: string }[] = [];
let recusar = false;
let confirmar = true;
let aliases = false;
let bancoDiferente = false;
let ausente = false;
let api: string;

function responder(req: IncomingMessage, res: ServerResponse) {
  const caminho = req.url ?? "";
  requisicoes.push({ metodo: req.method ?? "", caminho, catalogo: req.headers["cf-r2-data-catalog-check"] as string | undefined });
  const url = new URL(caminho, "http://localhost");
  const dbUrl = new URL(URL_BANCO_TESTE);
  let resultado: unknown;
  if (url.pathname.endsWith("/hyperdrive/configs/hyper-id")) resultado = { origin: { host: dbUrl.hostname, database: bancoDiferente ? "outro" : decodeURIComponent(dbUrl.pathname.slice(1)), user: decodeURIComponent(dbUrl.username), port: Number(dbUrl.port || 5432), scheme: "postgres" } };
  else if (url.pathname.endsWith("/domains/custom")) resultado = { domains: [{ domain: "fotos.exemplo.com", enabled: true }, ...(aliases ? [{ domain: "alias.exemplo.com", enabled: true }] : [])] };
  else if (url.pathname.endsWith("/domains/managed")) resultado = { domain: "outro.r2.dev", enabled: false };
  else if (url.pathname.endsWith("/objects")) {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ success: true, result: !ausente && url.searchParams.has("cursor") ? [{ key: chave }] : [], result_info: ausente || url.searchParams.has("cursor") ? { is_truncated: false } : { is_truncated: true, cursor: "pagina" } }));
    return;
  } else if (url.pathname.endsWith(`/objects/${chave}`)) {
    res.statusCode = req.method === "DELETE" ? (recusar ? 409 : ausente ? 404 : 200) : (confirmar ? 404 : 200);
    res.end();
    return;
  } else { res.statusCode = 500; res.end(); return; }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ success: true, result: resultado }));
}

const servidor = createServer(responder);
beforeAll(async () => {
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor de teste indisponível");
  api = `http://127.0.0.1:${endereco.port}`;
});
beforeEach(async () => {
  requisicoes.length = 0;
  recusar = false;
  confirmar = true;
  aliases = false;
  bancoDiferente = false;
  ausente = false;
  await db.$executeRawUnsafe(`TRUNCATE "FotoAposentada", "RegistroAuditoria", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`);
});
afterAll(async () => { await db.$disconnect(); await new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve())); });

function ambienteR2(cenario: Record<string, unknown> = {}) {
  return {
    R2_TESTE_API: api,
    R2_TESTE_CENARIO: JSON.stringify({ bucket: "fotos", origem: "https://fotos.exemplo.com", ...cenario }),
    CLOUDFLARE_ACCOUNT_ID: "conta", CLOUDFLARE_API_TOKEN: "token-sintetico",
    FOTOS_R2_BUCKET: "fotos", NEXT_PUBLIC_R2_PUBLIC_URL: "https://fotos.exemplo.com",
    DEPLOY_ENV: "production", FOTOS_DOMINIO_EXCLUSIVO: "confirmado",
  };
}

function mutacoes() { return requisicoes.filter((r) => r.metodo === "DELETE"); }
async function marcas() { return db.fotoAposentada.count(); }

describe("armazenamento local descartável", () => {
  it.each(["pasta", "arquivo"])("não remove arquivo externo após troca por link simbólico: %s", async (momento) => {
    const raiz = await mkdtemp(path.join(tmpdir(), "ndb82-local-"));
    const diretorio = path.join(raiz, "app");
    const pasta = path.join(diretorio, "public/enviados/historias");
    const fora = path.join(raiz, "fora");
    const nome = "ffffffffffffffffffffffff.jpg";
    await mkdir(pasta, { recursive: true });
    await mkdir(fora);
    await writeFile(path.join(pasta, nome), "arquivo administrado");
    await writeFile(path.join(fora, nome), "arquivo externo preservado");
    try {
      const r = await rodar(["descartar", `/enviados/historias/${nome}`], {
        FOTOS_DOMINIO_EXCLUSIVO: "confirmado", LOCAL_TESTE_TROCA: momento,
      }, diretorio);
      expect(await readFile(path.join(raiz, "troca-provada"), "utf8")).toBe(momento);
      expect(await readFile(path.join(fora, nome), "utf8")).toBe("arquivo externo preservado");
      if (momento === "pasta") {
        expect(await readFile(path.join(`${pasta}-original`, nome), "utf8")).toBe("arquivo administrado");
      } else {
        await expect(lstat(path.join(`${pasta}-original`, nome))).rejects.toMatchObject({ code: "ENOENT" });
      }
      expect.soft(r.codigo).toBe(1);
      expect.soft(r.stdout).not.toContain("descartada");
      const aposentadoria = await db.fotoAposentada.findUniqueOrThrow({ where: { dominio_chave: {
        dominio: `local:${path.join(diretorio, "public/enviados")}`, chave: `historias/${nome}`,
      } } });
      expect.soft(aposentadoria.confirmadaEm).toBeNull();
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  }, 60_000);

  it.each(["diretorio", "diretorio-ausente", "diretorio-unlink-ausente", "diretorio-removido", "diretorio-vazio", "entrada-recriada"])("recusa confirmação quando o armazenamento muda: %s", async (momento) => {
    const raiz = await mkdtemp(path.join(tmpdir(), "ndb82-diretorio-"));
    const diretorio = path.join(raiz, "app");
    const pasta = path.join(diretorio, "public/enviados/historias");
    const nome = "ffffffffffffffffffffffff.jpg";
    const chave = `historias/${nome}`;
    await mkdir(pasta, { recursive: true });
    await writeFile(path.join(pasta, nome), "arquivo administrado");
    try {
      const r = await rodar(["descartar", `/enviados/${chave}`], {
        FOTOS_DOMINIO_EXCLUSIVO: "confirmado", LOCAL_TESTE_TROCA: momento,
      }, diretorio);
      expect(await readFile(path.join(raiz, "troca-provada"), "utf8")).toBe(momento);
      await expect(lstat(path.join(`${pasta}-original`, nome))).rejects.toMatchObject({ code: "ENOENT" });
      if (momento === "diretorio-removido") {
        await expect(lstat(pasta)).rejects.toMatchObject({ code: "ENOENT" });
      } else if (momento === "diretorio-vazio") {
        expect((await lstat(pasta)).isDirectory()).toBe(true);
        await expect(lstat(path.join(pasta, nome))).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        expect((await lstat(pasta)).isDirectory()).toBe(true);
        expect(await readFile(path.join(pasta, nome), "utf8")).toBe("arquivo substituto preservado");
      }
      expect.soft(r.codigo).toBe(1);
      expect.soft(r.stdout).not.toContain("descartada");
      const aposentadoria = await db.fotoAposentada.findUniqueOrThrow({ where: { dominio_chave: {
        dominio: `local:${path.join(diretorio, "public/enviados")}`, chave,
      } } });
      expect.soft(aposentadoria.confirmadaEm).toBeNull();
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  }, 60_000);

  it("recusa excluir outro inode introduzido após o inventário", async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), "ndb82-inode-"));
    const diretorio = path.join(raiz, "app");
    const pasta = path.join(diretorio, "public/enviados/historias");
    const nome = "ffffffffffffffffffffffff.jpg";
    const chave = `historias/${nome}`;
    await mkdir(pasta, { recursive: true });
    await writeFile(path.join(pasta, nome), "arquivo administrado original");
    try {
      const r = await rodar(["descartar", `/enviados/${chave}`], {
        FOTOS_DOMINIO_EXCLUSIVO: "confirmado",
        LOCAL_TESTE_TROCA: "arquivo-substituido",
      }, diretorio);
      expect(await readFile(path.join(raiz, "troca-provada"), "utf8")).toBe("arquivo-substituido");
      expect(await readFile(path.join(pasta, nome), "utf8")).toBe("arquivo substituto preservado");
      expect(await readFile(path.join(pasta, `${nome}-original`), "utf8")).toBe("arquivo administrado original");
      expect(r.codigo).toBe(1);
      expect(r.stdout).not.toContain("descartada");
      const registro = await db.fotoAposentada.findUniqueOrThrow({ where: { dominio_chave: {
        dominio: `local:${path.join(diretorio, "public/enviados")}`, chave,
      } } });
      expect(registro.confirmadaEm).toBeNull();
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  }, 60_000);

  it("remove a entrada final substituída por link sem seguir o alvo externo", async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), "ndb82-entrada-"));
    const diretorio = path.join(raiz, "app");
    const pasta = path.join(diretorio, "public/enviados/historias");
    const fora = path.join(raiz, "fora");
    const nome = "ffffffffffffffffffffffff.jpg";
    const chave = `historias/${nome}`;
    await mkdir(pasta, { recursive: true });
    await mkdir(fora);
    await writeFile(path.join(pasta, nome), "arquivo administrado original");
    await writeFile(path.join(fora, nome), "alvo externo preservado");
    try {
      const r = await rodar(["descartar", `/enviados/${chave}`], {
        FOTOS_DOMINIO_EXCLUSIVO: "confirmado", LOCAL_TESTE_TROCA: "entrada",
      }, diretorio);
      expect(await readFile(path.join(raiz, "troca-provada"), "utf8")).toBe("entrada");
      expect(await readFile(path.join(fora, nome), "utf8")).toBe("alvo externo preservado");
      expect(await readFile(path.join(pasta, `${nome}-original`), "utf8")).toBe("arquivo administrado original");
      await expect(lstat(path.join(pasta, nome))).rejects.toMatchObject({ code: "ENOENT" });
      expect(r.codigo).toBe(0);
      expect(r.stdout).toContain("descartada");
      const aposentadoria = await db.fotoAposentada.findUniqueOrThrow({ where: { dominio_chave: {
        dominio: `local:${path.join(diretorio, "public/enviados")}`, chave,
      } } });
      expect(aposentadoria.confirmadaEm).toBeInstanceOf(Date);
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  }, 60_000);

  it("prova diagnóstico, preservação, descarte e repetição pelo comando real", async () => {
    const historiaUrl = "/enviados/historias/dddddddddddddddddddddddd.jpg";
    const perfilUrl = "/enviados/perfis/eeeeeeeeeeeeeeeeeeeeeeee.jpg";
    const arquivo = path.join(process.cwd(), "public", historiaUrl);
    const perfil = path.join(process.cwd(), "public", perfilUrl);
    await mkdir(path.dirname(arquivo), { recursive: true });
    await mkdir(path.dirname(perfil), { recursive: true });
    await writeFile(arquivo, new Uint8Array([0xff, 0xd8, 0xff]), { flag: "wx" });
    await writeFile(perfil, new Uint8Array([0xff, 0xd8, 0xff]), { flag: "wx" });
    try {
      const empresa = await db.empresa.create({ data: {
        instagramUsername: "local.cli", nome: "Loja", resumo: "Resumo", categoria: "Serviços", cidade: "Recife", uf: "PE",
        oculta: true, fotoUrl: perfilUrl, historia: `![Foto][imagem]\n\n[imagem]: ${historiaUrl}?x=1#foto`,
      } });
      expect((await rodar(["listar", historiaUrl])).stdout).toContain("preservada");
      expect(await marcas()).toBe(0);
      expect(await db.registroAuditoria.count()).toBe(0);
      const bloqueado = await rodar(["descartar", historiaUrl]);
      expect(bloqueado.codigo).toBe(1);
      expect(await marcas()).toBe(0);
      const permitido = { FOTOS_DOMINIO_EXCLUSIVO: "confirmado" };
      const protegido = await rodar(["descartar", historiaUrl], permitido);
      expect(protegido.codigo).toBe(0);
      expect(protegido.stdout).toContain("preservada");
      expect((await rodar(["descartar", perfilUrl], permitido)).codigo).toBe(1);
      expect((await lstat(perfil)).isFile()).toBe(true);
      await db.empresa.update({ where: { id: empresa.id }, data: { historia: "Sem foto" } });
      const removido = await rodar(["descartar", historiaUrl], permitido);
      expect(removido.codigo).toBe(0);
      expect(removido.stdout).toContain("descartada");
      await expect(lstat(arquivo)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await marcas()).toBe(1);
      await db.registroAuditoria.deleteMany();
      const repetido = await rodar(["descartar", historiaUrl], permitido);
      expect(repetido.codigo).toBe(0);
      expect(repetido.stdout).toContain("descartada");
      expect(await marcas()).toBe(1);
      expect((await lstat(perfil)).isFile()).toBe(true);
    } finally {
      await unlink(arquivo).catch((erro: NodeJS.ErrnoException) => { if (erro.code !== "ENOENT") throw erro; });
      await unlink(perfil);
    }
  }, 60_000);

  it("executa seed e migração com tsx sem o alias server-only do Vitest", async () => {
    for (const script of ["prisma/seed.ts", "scripts/fotos-para-r2.ts"]) {
      const resultado = await executar(process.execPath, ["--import", "tsx", script], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", DOTENV_CONFIG_PATH: "/dev/null", DATABASE_URL: URL_BANCO_TESTE },
      });
      expect(resultado.stderr).not.toContain("cannot be imported");
    }
    expect(await db.empresa.count()).toBeGreaterThan(0);
  }, 60_000);
});

describe("comando R2 com transporte isolado", () => {
  it("lista as páginas sem marcar ou excluir", async () => {
    const r = await rodar(["listar"], ambienteR2());
    expect(r.codigo).toBe(0);
    expect(r.stdout).toContain("inventário R2");
    expect(r.stdout).toContain(foto);
    expect(requisicoes.filter((r) => r.caminho.includes("/objects?")).length).toBe(2);
    expect(mutacoes()).toEqual([]);
    expect(await marcas()).toBe(0);
  });

  it("descarta somente a seleção após conferir a associação", async () => {
    const r = await rodar(["descartar", foto], ambienteR2());
    expect(r.codigo).toBe(0);
    expect(r.stdout).toContain("descartada");
    expect(await marcas()).toBe(1);
    expect(mutacoes()).toEqual([{ metodo: "DELETE", caminho: `/client/v4/accounts/conta/r2/buckets/fotos/objects/${chave}`, catalogo: "true" }]);
    expect(requisicoes.at(-1)?.metodo).toBe("GET");
  });

  it("repete a seleção aposentada que já desapareceu do inventário R2", async () => {
    expect((await rodar(["descartar", foto], ambienteR2())).codigo).toBe(0);
    ausente = true;
    const r = await rodar(["descartar", foto], ambienteR2());
    expect(r.codigo).toBe(0);
    expect(r.stdout).toContain("descartada");
    expect(await marcas()).toBe(1);
    expect(requisicoes.at(-1)?.metodo).toBe("GET");
  });

  it("preserva referências no banco", async () => {
    await db.empresa.create({ data: { instagramUsername: "r2.cli", nome: "Loja", resumo: "Resumo", categoria: "Serviços", cidade: "Recife", uf: "PE", historia: `![Foto](${foto})` } });
    const r = await rodar(["descartar", foto], ambienteR2());
    expect(r.codigo).toBe(0);
    expect(r.stdout).toContain("preservada");
    expect(mutacoes()).toEqual([]);
    expect(await marcas()).toBe(0);
  });

  it.each(["bucket", "origem", "banco", "identidade", "alias"])("recusa %s sem marcar ou excluir", async (caso) => {
    bancoDiferente = caso === "banco";
    aliases = caso === "alias";
    const cenario = caso === "bucket" ? { bucket: "outro" } : caso === "origem" ? { origem: "https://preview.exemplo.com" } : caso === "identidade" ? { semIdentidade: true } : {};
    const r = await rodar(["descartar", foto], ambienteR2(cenario));
    expect(r.codigo).toBe(1);
    expect(mutacoes()).toEqual([]);
    expect(await marcas()).toBe(0);
  });

  it.each(["recusa", "confirmacao"])("mantém a marca após falha de %s, sem repetir", async (caso) => {
    recusar = caso === "recusa";
    confirmar = caso !== "confirmacao";
    const r = await rodar(["descartar", foto], ambienteR2());
    expect(r.codigo).toBe(1);
    expect(await marcas()).toBe(1);
    expect(mutacoes()).toHaveLength(1);
    expect(mutacoes()[0].catalogo).toBe("true");
  });
});
