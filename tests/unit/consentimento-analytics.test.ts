import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_CONSENTIMENTO, consentimentoPositivo, gravarEscolha, lerConsentimento } from "@/lib/consentimento-analytics";
import { enviarEvento, paginaPermitida, sanearEvento } from "@/lib/medicao";
import { medir } from "@/lib/medicao-servidor";
import { GET } from "@/app/api/analytics/route";

const loja = vi.hoisted(() => new Map<string, { value: string }>());
const gravar = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (nome: string) => loja.get(nome), set: gravar }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); loja.clear(); gravar.mockClear(); });

describe("consentimento versionado", () => {
  it.each([undefined, "", "1:aceito:0", "0:aceito:9999999999999", "1:recusado:9999999999999"])("não autoriza valor inválido %s", valor => {
    expect(consentimentoPositivo(valor)).toBe(false);
  });
  it("confere a gravação e fecha a medição quando o armazenamento falha", () => {
    vi.stubGlobal("document", { get cookie() { return ""; }, set cookie(_valor: string) {} });
    vi.stubGlobal("location", { protocol: "https:" });
    expect(gravarEscolha(true)).toBe(false);
    expect(lerConsentimento()).toBeUndefined();
  });
  it("não envia por chamada direta antes da escolha positiva", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, location: { pathname: "/" } });
    vi.stubGlobal("document", { cookie: "" });
    enviarEvento("cadastro_etapa", { etapa: "nome", tipo: "indicacao" });
    expect(gtag).not.toHaveBeenCalled();
  });
  it("não cria fila no servidor sem consentimento", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-SINTETICO");
    await medir({ nome: "negocio_cadastrado", params: { tipo: "indicacao", categoria: "Saúde", uf: "BA", cidade: "Salvador", com_instagram: "sim" } });
    expect(gravar).not.toHaveBeenCalled();
  });
  it("mede eventos do funil com consentimento positivo", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-SINTETICO");
    loja.set(COOKIE_CONSENTIMENTO, { value: `1:aceito:${Date.now()}` });
    await medir({ nome: "login", params: { method: "senha" } });
    await medir({ nome: "perfil_reivindicado", params: { method: "documento", resultado: "verificada" } });
    expect(gravar).toHaveBeenCalledTimes(2);
  });
});

describe("carregador descartável", () => {
  it("não entrega carregador sem escolha positiva", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-SINTETICO");
    const resposta = await GET();
    expect(resposta.status).toBe(204);
    expect(await resposta.text()).toBe("");
  });
  it("concede analytics_storage com client_id estável e desativa publicidade", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-SINTETICO");
    loja.set(COOKIE_CONSENTIMENTO, { value: `1:aceito:${Date.now()}` });
    const resposta = await GET();
    const html = await resposta.text();
    expect(resposta.headers.get("Cache-Control")).toBe("private, no-store");
    expect(resposta.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(resposta.headers.get("Content-Security-Policy")).toContain("https://*.google.com");
    expect(html).toContain("send_page_view: false");
    expect(html).toContain("allow_google_signals: false");
    expect(html).toContain("allow_ad_personalization_signals: false");
    expect(html).toContain("client_id: configuracao.clientId");
    expect(html).toContain("evento.source !== parent");
    expect(html).toContain("configuracao.origem = location.origin");
    expect(html).not.toContain("document.referrer");
    expect(html).not.toContain("document.cookie");
    expect(html).toContain("analytics_storage: 'denied'");
    expect(html).toContain("gtag('consent', 'update', { analytics_storage: 'granted' })");
    expect(html).toContain("ad_storage: 'denied'");
    expect(html).not.toContain("user_id");
  });
});

describe("listas permitidas", () => {
  it.each(["/painel", "/painel/sintetico", "/moderacao", "/entrar", "/cadastrar", "/link", "/empresas/sintetico/reivindicar", "/causas/antirracista", "/desconhecido"])("recusa a rota %s", caminho => {
    expect(paginaPermitida(caminho)).toBeNull();
  });
  it("inclui páginas públicas do diretório e reduz rotas dinâmicas a caminhos genéricos", () => {
    expect(paginaPermitida("/embaixadores")).toEqual({ caminho: "/embaixadores", titulo: "Embaixadores do bem" });
    expect(paginaPermitida("/clube-do-bem")).toEqual({ caminho: "/clube-do-bem", titulo: "Clube do Bem" });
    expect(paginaPermitida("/vagas")).toEqual({ caminho: "/vagas", titulo: "Vagas" });
    expect(paginaPermitida("/tipos")).toEqual({ caminho: "/tipos", titulo: "Categorias" });
    expect(paginaPermitida("/tipos/cafe-e-padaria")).toEqual({ caminho: "/tipos/tipo", titulo: "Negócios por categoria" });
    expect(paginaPermitida("/cupons")).toEqual({ caminho: "/cupons", titulo: "Ofertas do Clube do Bem" });
    expect(paginaPermitida("/favoritos")).toEqual({ caminho: "/favoritos", titulo: "Favoritos" });
    expect(paginaPermitida("/empresas/perfil-sintetico")).toEqual({ caminho: "/empresas/perfil", titulo: "Perfil de negócio" });
  });
  it("descarta nomes desconhecidos e todos os parâmetros livres", () => {
    expect(sanearEvento("inventado", { email: "sintetico@example.invalid" })).toBeNull();
    expect(sanearEvento("contato_negocio", { canal: "site", categoria: "Saúde", uf: "BA", email: "sintetico@example.invalid", q: "termo sintético", user_id: "sintetico" })).toEqual({ nome: "contato_negocio", params: { canal: "site", categoria: "Saúde", uf: "BA" } });
    expect(sanearEvento("cadastro_etapa", { etapa: "sintetico@example.invalid", tipo: "indicacao" })).toBeNull();
  });
});
