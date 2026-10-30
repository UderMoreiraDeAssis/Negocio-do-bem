import { describe, expect, it } from "vitest";
import { interpretarViaCep, lerRetryAfter, montarEndereco, RETRY_AFTER_MAXIMO_MS } from "@/lib/cep";
import { limparCep } from "@/lib/endereco";

describe("CEP", () => {
  it.each([
    ["01001-000", "01001000"],
    ["01001000", "01001000"],
    [" 00000-001 ", "00000001"],
    ["1001-000", null],
    ["01001-0000", null],
    ["01.001-000", null],
    ["abcde-fgh", null],
  ])("limpa %s", (valor, esperado) => {
    expect(limparCep(valor)).toBe(esperado);
  });
});

describe("resposta do ViaCEP", () => {
  const encontrado = { cep: "72210-000", logradouro: "QNN 1", bairro: "Ceilândia Sul (Ceilândia)", localidade: "Brasília", uf: "DF" };

  it("separa CEP inexistente, com erro como booleano ou texto", () => {
    expect(interpretarViaCep("99999999", { erro: true })).toEqual({ tipo: "inexistente" });
    expect(interpretarViaCep("99999999", { erro: "true" })).toEqual({ tipo: "inexistente" });
  });

  it("trata resposta inesperada como falha, nunca como inexistência", () => {
    expect(interpretarViaCep("72210000", null)).toEqual({ tipo: "falha" });
    expect(interpretarViaCep("72210000", "<html>")).toEqual({ tipo: "falha" });
    expect(interpretarViaCep("72210000", { ...encontrado, cep: "01001-000" })).toEqual({ tipo: "falha" });
    expect(interpretarViaCep("72210000", { ...encontrado, uf: "Distrito Federal" })).toEqual({ tipo: "falha" });
  });

  it("lê os dados postais", () => {
    expect(interpretarViaCep("72210000", encontrado)).toEqual({
      tipo: "encontrado",
      dados: { uf: "DF", cidade: "Brasília", bairro: "Ceilândia Sul (Ceilândia)", logradouro: "QNN 1" },
    });
  });

  it("lê o Retry-After em segundos ou como data, com limite", () => {
    const agora = Date.parse("2026-10-30T12:00:00Z");
    expect(lerRetryAfter("120", agora)).toBe(120_000);
    expect(lerRetryAfter("Fri, 30 Oct 2026 12:05:00 GMT", agora)).toBe(300_000);
    expect(lerRetryAfter("999999999", agora)).toBe(RETRY_AFTER_MAXIMO_MS);
    expect(lerRetryAfter(null, agora)).toBeNull();
    expect(lerRetryAfter("amanhã", agora)).toBeNull();
    expect(lerRetryAfter("Fri, 30 Oct 2026 11:00:00 GMT", agora)).toBeNull();
  });
});

describe("endereço montado a partir do CEP", () => {
  const base = { uf: "DF", cidade: "Brasilia", logradouro: null };

  it("no DF, separa a região administrativa que vem entre parênteses", () => {
    expect(montarEndereco("72210000", { ...base, bairro: "Ceilândia Sul (Ceilândia)" })).toMatchObject({
      cidade: "Brasília",
      bairro: "Ceilândia Sul",
      regiaoAdministrativa: "Ceilândia",
    });
    expect(montarEndereco("72000000", { ...base, bairro: "Taguatinga" })).toMatchObject({ bairro: null, regiaoAdministrativa: "Taguatinga" });
  });

  it("não deduz região de Brasília nem de nome fora da lista do GDF", () => {
    expect(montarEndereco("70000000", { ...base, bairro: "Asa Sul" })).toMatchObject({ bairro: "Asa Sul", regiaoAdministrativa: null });
    expect(montarEndereco("70000000", { ...base, bairro: null })).toMatchObject({ regiaoAdministrativa: null });
  });

  it("fora do DF, não cria região e mantém Taguatinga/TO como município", () => {
    expect(montarEndereco("77320000", { uf: "TO", cidade: "Taguatinga", bairro: "Centro (Taguatinga)", logradouro: null })).toMatchObject({
      cidade: "Taguatinga",
      uf: "TO",
      bairro: "Centro (Taguatinga)",
      regiaoAdministrativa: null,
    });
  });

  it("deixa a cidade vazia quando ela não está na lista do IBGE", () => {
    expect(montarEndereco("01001000", { uf: "SP", cidade: "Cidade Inventada", bairro: null, logradouro: null }).cidade).toBeNull();
  });
});
