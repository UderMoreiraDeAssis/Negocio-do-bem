import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const camadas = vi.hoisted(() => ({
  persistente: vi.fn<(cnpj: string) => Promise<unknown>>(),
  renderizacao: vi.fn<(cnpj: string) => Promise<unknown>>(),
  configuracoes: [] as unknown[][],
}));

vi.mock("next/cache", () => ({
  unstable_cache: (consulta: (cnpj: string) => Promise<unknown>, chave: string[], opcoes: unknown) => {
    camadas.configuracoes.push([chave, opcoes]);
    camadas.persistente.mockImplementation(consulta);
    return camadas.persistente;
  },
}));
vi.mock("react", () => ({
  cache: (consulta: (cnpj: string) => Promise<unknown>) => {
    camadas.renderizacao.mockImplementation(consulta);
    return camadas.renderizacao;
  },
}));

import { buscarNaReceita, consultarCnpj } from "../../src/lib/cnpj";

const cnpj = "11222333000181";
const padrao = {
  razaoSocial: "(sem razão social)",
  nomeFantasia: null,
  situacao: null,
  municipio: null,
  uf: null,
  socios: [],
  telefone: null,
  email: null,
};
let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  camadas.persistente.mockClear();
  camadas.renderizacao.mockClear();
  fetchFalso = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

describe("consultarCnpj: projeção e contrato, sem simular persistência", () => {
  it("configura a janela diária somente para o resultado interpretado", () => {
    expect(camadas.configuracoes).toEqual([[["brasilapi-cnpj-v1"], { revalidate: 86400 }]]);
  });

  it.each(["", "123", "00000000000000", "11222333000182", "12ABC34501DE36"])(
    "recusa %s antes das duas camadas e da rede", async valor => {
      expect(await consultarCnpj(valor)).toBeNull();
      expect(camadas.persistente).not.toHaveBeenCalled();
      expect(camadas.renderizacao).not.toHaveBeenCalled();
      expect(fetchFalso).not.toHaveBeenCalled();
    },
  );

  it.each([["11.222.333/0001-81", cnpj], ["12.abc.345/01de-35", "12ABC34501DE35"]])(
    "normaliza %s antes do compartilhamento", async (valor, normalizado) => {
      expect(await consultarCnpj(valor)).toEqual(padrao);
      expect(camadas.renderizacao).toHaveBeenCalledExactlyOnceWith(normalizado);
      expect(camadas.persistente).toHaveBeenCalledExactlyOnceWith(normalizado);
      const [url, opcoes] = fetchFalso.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://brasilapi.com.br/api/cnpj/v1/${normalizado}`);
      expect(new Headers(opcoes.headers).get("User-Agent")).toBe("NegocioDoBem/1.0 (+https://github.com/fabs-reis/Negocio-do-bem)");
      expect(opcoes.signal).toBeInstanceOf(AbortSignal);
      expect(opcoes).not.toHaveProperty("next");
    },
  );

  it("projeta só os campos públicos da ficha e conserva acentos e caixa", async () => {
    fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify({
      razao_social: "  Razão Ágil Ltda  ",
      nome_fantasia: "  Bem  ",
      descricao_situacao_cadastral: " ATIVA ",
      municipio: " São Luís ",
      uf: " MA ",
      qsa: [
        { nome_socio: "  Dora Dona  ", qualificacao_socio: " Sócia-Administradora ", cnpj_cpf_do_socio: " ***982247** " },
        { nome_socio: "   ", qualificacao_socio: "Ignorado" },
      ],
      ddd_telefone_1: " 8133334444 ",
      email: " CONTATO@BEM.COM.BR ",
      socios: ["não incluir"],
      telefone: "não incluir",
    })));
    expect(await consultarCnpj(cnpj)).toEqual({
      razaoSocial: "Razão Ágil Ltda",
      nomeFantasia: "Bem",
      situacao: "ATIVA",
      municipio: "São Luís",
      uf: "MA",
      socios: [{ nome: "Dora Dona", qualificacao: "Sócia-Administradora", cpfMascarado: "***982247**" }],
      telefone: "8133334444",
      email: "contato@bem.com.br",
    });
  });

  it.each([undefined, null, "", "  ", 0, false, [], {}].map(valor => ({ valor })))("mantém os padrões para campos não textuais ou vazios ($valor)", async ({ valor }) => {
    fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify({
      razao_social: valor, nome_fantasia: valor, descricao_situacao_cadastral: valor, municipio: valor, uf: valor,
      qsa: valor, ddd_telefone_1: valor, email: valor,
    })));
    expect(await consultarCnpj(cnpj)).toEqual(padrao);
  });

  it.each([403, 404, 429, 500])("converte HTTP %i em null só fora do limite persistente", async status => {
    fetchFalso.mockImplementation(async () => new Response("{}", { status }));
    expect(await consultarCnpj(cnpj)).toBeNull();
    await expect(camadas.persistente.mock.results[0].value).rejects.toBeInstanceOf(Error);
    fetchFalso.mockResolvedValueOnce(new Response("{}"));
    expect(await consultarCnpj(cnpj)).toEqual(padrao);
  });

  it.each(["json", "rede", "timeout"])("converte falha de %s em null sem resolver a camada interna", async falha => {
    if (falha === "json") fetchFalso.mockResolvedValueOnce(new Response("{inválido"));
    else fetchFalso.mockRejectedValueOnce(new Error(falha));
    expect(await consultarCnpj(cnpj)).toBeNull();
    await expect(camadas.persistente.mock.results[0].value).rejects.toBeInstanceOf(Error);
    expect(await consultarCnpj(cnpj)).toEqual(padrao);
  });

  it("mantém o timeout de cinco segundos", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await consultarCnpj(cnpj);
      expect(timeout).toHaveBeenCalledExactlyOnceWith(5000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("consulta diretamente quando o cache incremental do Next não está presente", async () => {
    camadas.persistente.mockRejectedValueOnce(new Error("Invariant: incrementalCache missing in unstable_cache"));
    expect(await consultarCnpj(cnpj)).toEqual(padrao);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("buscarNaReceita separa 404 de falha de rede e de CNPJ inválido", async () => {
    expect(await buscarNaReceita("11.222.333/0001-82")).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();

    fetchFalso.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await buscarNaReceita(cnpj)).toBe("nao_encontrado");

    fetchFalso.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    expect(await buscarNaReceita(cnpj)).toBeNull();

    fetchFalso.mockResolvedValueOnce(new Response("{}"));
    expect(await buscarNaReceita(cnpj)).toEqual(padrao);
  });
});
