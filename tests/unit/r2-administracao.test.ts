import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ciclo-fotos", () => ({ descartarFotos: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));

const transportes = vi.hoisted(() => ({ executar: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: transportes.executar }));

const chave = "historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";
const url = `https://fotos.exemplo.com/${chave}`;
let bindings: Array<Record<string, unknown>>;
let dominios: Array<Record<string, unknown>>;
let gerenciado: Record<string, unknown>;
let origem: Record<string, unknown>;
let paginas: Array<Record<string, unknown>>;
let chamadas: string[];

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "conta");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-falso");
  vi.stubEnv("FOTOS_R2_BUCKET", "fotos");
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://fotos.exemplo.com");
  vi.stubEnv("DEPLOY_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://usuario:senha-falsa@banco.exemplo.com:5432/app");
  bindings = [
    { name: "UPLOADS", type: "r2_bucket", bucket_name: "fotos" },
    { name: "DEPLOY_ENV", type: "plain_text", text: "production" },
    { name: "NEXT_PUBLIC_R2_PUBLIC_URL", type: "plain_text", text: "https://fotos.exemplo.com" },
    { name: "HYPERDRIVE", type: "hyperdrive", id: "hyper-id" },
  ];
  dominios = [{ domain: "fotos.exemplo.com", enabled: true }];
  gerenciado = { domain: "outro.r2.dev", enabled: false };
  origem = { host: "banco.exemplo.com", database: "app", user: "usuario", port: 5432, scheme: "postgres" };
  paginas = [{ success: true, result: [{ key: chave }], result_info: { is_truncated: false } }];
  chamadas = [];
  transportes.executar.mockReset();
  transportes.executar.mockImplementation((_bin, args, _opcoes, callback) => {
    if (args[0] === "deployments") return callback(null, JSON.stringify([{ created_on: "2026-01-01T00:00:00Z", versions: [{ version_id: "v1", percentage: 100 }] }]), "");
    if (args[0] === "versions") return callback(null, JSON.stringify({ id: args[2], resources: { bindings } }), "");
    callback(null, "", "");
  });
  vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => {
    const endereco = new URL(String(entrada));
    chamadas.push(endereco.pathname + endereco.search);
    let corpo: unknown;
    if (endereco.pathname.endsWith("/objects")) corpo = paginas.shift();
    else if (endereco.pathname.endsWith("/domains/custom")) corpo = { success: true, result: { domains: dominios } };
    else if (endereco.pathname.endsWith("/domains/managed")) corpo = { success: true, result: gerenciado };
    else if (endereco.pathname.endsWith("/hyperdrive/configs/hyper-id")) corpo = { success: true, result: { origin: origem } };
    else throw new Error("URL inesperada");
    return new Response(JSON.stringify(corpo), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("administração R2", () => {
  it("não usa disco quando a configuração remota está incompleta", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "");
    vi.stubEnv("FOTOS_R2_BUCKET", "");
    const { limparFotosHistorias, descreverArmazenamento } = await import("@/lib/armazenamento");
    expect(descreverArmazenamento()).toContain("R2");
    await expect(limparFotosHistorias()).rejects.toThrow();
    expect(chamadas).toEqual([]);
  });

  it("compara o nome codificado com o banco efetivo do cliente pg", async () => {
    const conexao = "postgresql://usuario@banco.exemplo.com/db%2Fdata";
    const bancoEfetivo = new Client({ connectionString: conexao }).database;
    expect(bancoEfetivo).toBe("db%2Fdata");
    vi.stubEnv("DATABASE_URL", conexao);
    origem.database = "db/data";
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(true)).rejects.toThrow("Não foi possível confirmar a associação do R2, Worker e banco.");
    expect(chamadas.some((c) => c.includes("/objects"))).toBe(false);

    origem.database = bancoEfetivo;
    expect((await prepararInventarioHistoriasR2(true)).objetos.get(url)).toBe(chave);
  });

  it("recusa conexões que o pg reescreve antes de interpretar a URL", async () => {
    const conexao = "postgresql://usuario@banco.exemplo.com/db%C3%A9?application_name=a b";
    expect(new Client({ connectionString: conexao }).database).toBe("db%C3%A9");
    vi.stubEnv("DATABASE_URL", conexao);
    origem.database = "dbé";
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(true)).rejects.toThrow();
    expect(chamadas.some((c) => c.includes("/objects"))).toBe(false);
  });

  it("recusa schema customizado antes de qualquer descarte", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://usuario:senha-falsa@banco.exemplo.com/app?schema=privado");
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(true)).rejects.toThrow();
    expect(chamadas).toEqual([]);
  });

  it("recusa conflito de catálogo sem repetir a exclusão", async () => {
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    const inventario = await prepararInventarioHistoriasR2(true);
    const fetchOriginal = vi.mocked(fetch);
    const chamadasDelete: RequestInit[] = [];
    fetchOriginal.mockImplementation(async (_url, opcoes) => {
      chamadasDelete.push(opcoes!);
      return new Response(null, { status: 409 });
    });
    await expect(inventario.excluir(url)).rejects.toThrow();
    await expect(inventario.excluir(url)).rejects.toThrow();
    expect(chamadasDelete).toHaveLength(1);
    expect(chamadasDelete[0]).toMatchObject({ method: "DELETE", redirect: "error", headers: { "cf-r2-data-catalog-check": "true" } });
  });

  it("exige confirmação de ausência depois da exclusão", async () => {
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    const inventario = await prepararInventarioHistoriasR2(true);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await expect(inventario.excluir(url)).rejects.toThrow();
    expect(vi.mocked(fetch).mock.calls.slice(-2).map((c) => c[1]?.method)).toEqual(["DELETE", "GET"]);
  });

  it("lista páginas e aceita apenas chaves canônicas de histórias", async () => {
    paginas = [
      { success: true, result: [{ key: chave }, { key: "perfis/bbbbbbbbbbbbbbbbbbbbbbbb.png" }, { key: "historias/../x.jpg" }], result_info: { is_truncated: true, cursor: "cursor+1" } },
      { success: true, result: [{ key: "historias/bbbbbbbbbbbbbbbbbbbbbbbb.webp" }], result_info: { is_truncated: false } },
    ];
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    const inventario = await prepararInventarioHistoriasR2(false);
    expect([...inventario.objetos.keys()]).toEqual([url, "https://fotos.exemplo.com/historias/bbbbbbbbbbbbbbbbbbbbbbbb.webp"]);
    expect(chamadas.some((c) => c.includes("cursor=cursor%2B1"))).toBe(true);
    await expect(inventario.excluir(url)).rejects.toThrow();
    expect(transportes.executar).not.toHaveBeenCalled();
  });

  it("confere a associação antes de permitir excluir somente uma chave inventariada", async () => {
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    const inventario = await prepararInventarioHistoriasR2(true);
    await expect(inventario.excluir(`${url}?x=1`)).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await inventario.excluir(url);
    const chamadasObjeto = vi.mocked(fetch).mock.calls.slice(-2);
    expect(chamadasObjeto.map((c) => c[0])).toEqual([`https://api.cloudflare.com/client/v4/accounts/conta/r2/buckets/fotos/objects/${chave}`, `https://api.cloudflare.com/client/v4/accounts/conta/r2/buckets/fotos/objects/${chave}`]);
    expect(chamadasObjeto[0][1]).toMatchObject({ method: "DELETE", redirect: "error", headers: { "cf-r2-data-catalog-check": "true" } });
    expect(chamadasObjeto[1][1]).toMatchObject({ method: "GET", redirect: "error" });
    await expect(inventario.excluir(url)).rejects.toThrow();
    expect(transportes.executar.mock.calls.some((c) => c[1][0] === "r2")).toBe(false);
  });

  it("aceita o domínio gerenciado quando ele é o único ativo", async () => {
    dominios = [];
    gerenciado = { domain: "fotos.exemplo.com", enabled: true };
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    expect((await prepararInventarioHistoriasR2(true)).objetos.get(url)).toBe(chave);
  });

  it("recusa respostas grandes sem expor o conteúdo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(16 * 1024 * 1024 + 1))));
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(false)).rejects.toThrow("Não foi possível consultar os metadados R2.");
    expect(transportes.executar).not.toHaveBeenCalled();
  });

  it("confere todas as versões ativas da implantação mais recente", async () => {
    transportes.executar.mockImplementation((_bin, args, _opcoes, callback) => {
      if (args[0] === "deployments") return callback(null, JSON.stringify([
        { created_on: "2025-01-01T00:00:00Z", versions: [{ version_id: "antiga", percentage: 100 }] },
        { created_on: "2026-01-01T00:00:00Z", versions: [{ version_id: "v1", percentage: 80 }, { version_id: "v2", percentage: 20 }] },
      ]), "");
      if (args[0] === "versions") return callback(null, JSON.stringify({ id: args[2], resources: { bindings: args[2] === "v2" ? bindings.filter((b) => b.name !== "UPLOADS") : bindings } }), "");
      callback(null, "", "");
    });
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(true)).rejects.toThrow();
    expect(transportes.executar.mock.calls.filter((c) => c[1][0] === "versions").map((c) => c[1][2])).toEqual(["v1", "v2"]);
    expect(transportes.executar.mock.calls.some((c) => c[1][0] === "r2")).toBe(false);
  });

  it("não autoriza chave inserida no mapa após o inventário", async () => {
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    const inventario = await prepararInventarioHistoriasR2(true);
    const transporte = vi.fn<typeof fetch>(async (_entrada, opcoes) => new Response(null, { status: opcoes?.method === "DELETE" ? 200 : 404 }));
    vi.stubGlobal("fetch", transporte);
    inventario.objetos.set("https://fotos.exemplo.com/historias/bbbbbbbbbbbbbbbbbbbbbbbb.jpg", "historias/bbbbbbbbbbbbbbbbbbbbbbbb.jpg");
    await expect(inventario.excluir("https://fotos.exemplo.com/historias/bbbbbbbbbbbbbbbbbbbbbbbb.jpg")).rejects.toThrow();
    expect(transportes.executar.mock.calls.some((c) => c[1][0] === "r2")).toBe(false);
    expect(transporte).not.toHaveBeenCalled();
  });

  it("recusa paginação repetida sem excluir", async () => {
    paginas = [1, 2].map(() => ({ success: true, result: [], result_info: { is_truncated: true, cursor: "repetido" } }));
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(true)).rejects.toThrow();
    expect(transportes.executar.mock.calls.some((c) => c[1][0] === "r2")).toBe(false);
  });

  it.each(["bucket", "origem", "banco", "host", "usuario", "porta", "identidade", "dominios", "variavel", "api", "processo"])("recusa %s sem excluir", async (caso) => {
    if (caso === "bucket") bindings[0].bucket_name = "outro";
    if (caso === "origem") dominios[0].domain = "outra.exemplo.com";
    if (caso === "banco") origem.database = "outro";
    if (caso === "host") origem.host = "outro.exemplo.com";
    if (caso === "usuario") origem.user = "outro";
    if (caso === "porta") origem.port = 5433;
    if (caso === "identidade") bindings = bindings.filter((b) => b.name !== "HYPERDRIVE");
    if (caso === "dominios") gerenciado = { domain: "outro.r2.dev", enabled: true };
    if (caso === "variavel") bindings[1].text = "preview";
    if (caso === "api") vi.stubGlobal("fetch", vi.fn(async () => new Response("segredo", { status: 403 })));
    if (caso === "processo") transportes.executar.mockImplementation((_b, _a, _o, cb) => cb(new Error("segredo"), "", ""));
    const { prepararInventarioHistoriasR2 } = await import("@/lib/r2-administracao");
    await expect(prepararInventarioHistoriasR2(true)).rejects.not.toThrow("segredo");
    expect(transportes.executar.mock.calls.some((c) => c[1][0] === "r2")).toBe(false);
  });
});
