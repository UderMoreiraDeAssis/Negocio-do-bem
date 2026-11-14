import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_CONSENTIMENTO } from "@/lib/consentimento-analytics";
import { COOKIE_EVENTOS, juntarEvento, lerEventos, medirContato, origemDoTrafego, type Evento } from "@/lib/medicao";
import { medir } from "@/lib/medicao-servidor";

const loja = vi.hoisted(() => new Map<string, { value: string; opcoes: Record<string, unknown> }>());
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (nome: string) => loja.get(nome),
  set: (nome: string, value: string, opcoes: Record<string, unknown>) => loja.set(nome, { value, opcoes }),
}) }));
const INDICACAO: Evento = { nome: "negocio_cadastrado", params: { tipo: "indicacao", categoria: "Café e padaria", uf: "BA", cidade: "Salvador", com_instagram: "sim" } };
const INDICACAO_MINIMA = { nome: "negocio_cadastrado", params: { tipo: "indicacao", categoria: "Café e padaria", uf: "BA", com_instagram: "sim" } };
const escolha = () => `1:aceito:${Date.now()}`;

describe("fila vinculada à escolha", () => {
  it.each([undefined, "", "lixo", "{}", '{"nome":"login"}', "null"])("ignora o cookie fora do formato %j", valor => {
    expect(lerEventos(valor, escolha())).toEqual([]);
  });
  it("põe o evento no fim da fila e guarda só os 5 últimos", () => {
    let valor: string | undefined;
    const consentimento = escolha();
    for (let i = 0; i < 6; i++) valor = juntarEvento(valor, INDICACAO, consentimento);
    expect(lerEventos(valor, consentimento)).toEqual(Array(5).fill(INDICACAO_MINIMA));
  });
  it("descarta a fila anterior e o formato antigo depois da aceitação", () => {
    const antigo = `1:aceito:${Date.now() - 1000}`;
    const valor = juntarEvento(undefined, INDICACAO, antigo);
    expect(lerEventos(valor, escolha())).toEqual([]);
    expect(lerEventos(JSON.stringify([INDICACAO]), escolha())).toEqual([]);
    expect(lerEventos(valor, undefined)).toEqual([]);
  });
  it("descarta eventos e parâmetros fora da lista", () => {
    const consentimento = escolha();
    const valor = JSON.stringify({
      consentimento,
      eventos: [
        null,
        "login",
        { nome: "login", params: { method: "invalido" } },
        { nome: "contato_negocio", params: { canal: "telefone", categoria: "Saúde", uf: "BA", email: "sintetico@example.invalid" } },
      ],
    });
    expect(lerEventos(valor, consentimento)).toEqual([{ nome: "contato_negocio", params: { canal: "telefone", categoria: "Saúde", uf: "BA" } }]);
  });
});

describe("medirContato", () => {
  it("marca canal, categoria e UF, sem identificar o negócio", () => {
    expect(medirContato("whatsapp", { categoria: "Saúde", uf: "BA" })).toEqual({ "data-medir": "contato_negocio", "data-canal": "whatsapp", "data-categoria": "Saúde", "data-uf": "BA" });
  });
});

describe("origem do tráfego", () => {
  it.each([
    ["", "direto"],
    ["https://www.google.com/search?q=termo-sintetico", "busca"],
    ["https://l.instagram.com/?email=sintetico@example.invalid", "rede_social"],
    ["https://ndb.invalid/painel?token=sintetico", "interno"],
    ["https://privado.invalid/pessoa-sintetica", "outro"],
    ["valor inválido", "outro"],
  ])("classifica %s sem transmitir o referrer", (valor, resultado) => {
    expect(origemDoTrafego(valor, "https://ndb.invalid")).toBe(resultado);
  });
});

describe("medir", () => {
  beforeEach(() => loja.clear());
  afterEach(() => vi.unstubAllEnvs());
  it("não cria cookie sem o Analytics configurado", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "");
    await medir(INDICACAO);
    expect(loja.size).toBe(0);
  });
  it("não deixa eventos no cookie antes da escolha positiva", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-SINTETICO");
    await medir(INDICACAO);
    expect(loja.has(COOKIE_EVENTOS)).toBe(false);
  });
  it("deixa só eventos permitidos num cookie curto após consentimento", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-SINTETICO");
    const consentimento = escolha();
    loja.set(COOKIE_CONSENTIMENTO, { value: consentimento, opcoes: {} });
    await medir(INDICACAO);
    const cookie = loja.get(COOKIE_EVENTOS);
    expect(lerEventos(cookie?.value, consentimento)).toEqual([INDICACAO_MINIMA]);
    expect(cookie?.opcoes).toMatchObject({ httpOnly: false, sameSite: "lax", path: "/", maxAge: 300 });
  });
});
