import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CAMPOS_ENDERECO, enderecoPostalPublico, formatarLocalizacao } from "@/lib/endereco";
import { campoCep, campoMunicipio, camposEndereco, erroRegiaoCompativel, regiaoCompativel } from "@/lib/formulario";
import { textoDeBusca } from "@/lib/texto";
import { interpretarLocal, sugerirLocais } from "@/lib/diretorio";

const esquema = z.object({ municipio: campoMunicipio, ...camposEndereco }).refine(regiaoCompativel, erroRegiaoCompativel);
const vazio = Object.fromEntries(CAMPOS_ENDERECO.map((campo) => [campo, ""]));

describe("endereço brasileiro", () => {
  it.each(["01001-000", "01001000", " 01001-000 "])("preserva os oito dígitos de %s", (valor) => {
    expect(campoCep.parse(valor)).toBe("01001000");
  });

  it.each(["1001000", "010010000", "01001 000", "0100-1000", "abcdefgh", "01.001-000"])("recusa formato inválido %s", (valor) => {
    expect(campoCep.safeParse(valor).success).toBe(false);
  });

  it("permite apenas município/UF, inclusive em um cadastro antigo", () => {
    expect(esquema.parse({ ...vazio, municipio: "Recife, PE" })).toMatchObject({
      municipio: { nome: "Recife", uf: "PE" }, cep: null, regiaoAdministrativa: null, bairro: null, logradouro: null,
    });
    expect(formatarLocalizacao({ cidade: "Recife", uf: "PE" })).toBe("Recife, PE");
  });

  it.each(["Ceilândia", "Taguatinga", "Águas Claras", "26 de Setembro", "Ponte Alta"])("aceita %s separada de Brasília/DF", (regiao) => {
    expect(esquema.parse({ ...vazio, municipio: "brasilia df", regiaoAdministrativa: regiao.toLowerCase() }).regiaoAdministrativa).toBe(regiao);
  });

  it("não transforma regiões em municípios nem aceita uma região fora do DF", () => {
    expect(esquema.safeParse({ ...vazio, municipio: "Ceilândia, DF" }).success).toBe(false);
    expect(esquema.safeParse({ ...vazio, municipio: "Taguatinga, TO", regiaoAdministrativa: "Taguatinga" }).success).toBe(false);
    expect(esquema.safeParse({ ...vazio, municipio: "Brasília, DF", regiaoAdministrativa: "Inventada" }).success).toBe(false);
  });

  it("preserva endereço rural, quadra, conjunto, lote, letras e s/n", () => {
    const rural = esquema.parse({ ...vazio, municipio: "Recife, PE", localidade: " Comunidade do Campo ", numero: "s/n", complemento: "Próximo ao açude" });
    expect(rural).toMatchObject({ localidade: "Comunidade do Campo", numero: "s/n", logradouro: null });
    expect(esquema.parse({ ...vazio, municipio: "Brasília, DF", logradouro: "QNN 1, conjunto A", numero: "12B", complemento: "Lote 4, bloco C" })).toMatchObject({
      logradouro: "QNN 1, conjunto A", numero: "12B", complemento: "Lote 4, bloco C",
    });
  });

  it.each([["bairro", 100], ["localidade", 100], ["logradouro", 200], ["numero", 30], ["complemento", 200]] as const)("limita %s no servidor", (campo, limite) => {
    expect(esquema.safeParse({ ...vazio, municipio: "Recife, PE", [campo]: "a".repeat(limite + 1) }).success).toBe(false);
  });

  it("só apresenta o endereço postal autorizado e mantém subdivisões na busca", () => {
    const empresa = { nome: "Loja", resumo: "Um negócio", categoria: "Serviços", instagramUsername: "loja", cidade: "Brasília", uf: "DF",
      bairro: "Setor Sul", regiaoAdministrativa: "Taguatinga", cep: "01001000", logradouro: "Via Reservada", numero: "12B", complemento: "Bloco Privado" };
    expect(formatarLocalizacao(empresa)).toBe("Setor Sul · Taguatinga · Brasília, DF");
    expect(enderecoPostalPublico(empresa)).toBeNull();
    expect(enderecoPostalPublico({ ...empresa, enderecoPublico: true })).toBe("Via Reservada, 12B · Bloco Privado · CEP 01001-000");
    expect(textoDeBusca(empresa)).toContain("taguatinga setor sul");
    expect(textoDeBusca(empresa)).not.toMatch(/reservada|12b|privado|01001000/);
  });
});

describe("localidades no Onde?", () => {
  const cidades = [{ cidade: "Brasília", uf: "DF", total: 2 }, { cidade: "Taguatinga", uf: "TO", total: 1 }];
  const localidades = [
    { nome: "Taguatinga", cidade: "Brasília", uf: "DF", total: 1 },
    { nome: "Centro", cidade: "Brasília", uf: "DF", total: 1 },
    { nome: "Centro", cidade: "Taguatinga", uf: "TO", total: 1 },
  ];

  it("distingue Taguatinga/DF de Taguatinga/TO com ou sem acento", () => {
    expect(interpretarLocal("taguatinga, df", cidades, localidades)).toMatchObject({ cidade: "Brasília", uf: "DF", localidade: "Taguatinga" });
    expect(interpretarLocal("taguatinga, to", cidades, localidades)).toEqual({ cidade: "Taguatinga", uf: "TO", rotulo: "Taguatinga, TO" });
    expect(interpretarLocal("CEILANDIA", cidades, localidades)).toMatchObject({ cidade: "Brasília", uf: "DF", localidade: "Ceilândia" });
  });

  it("qualifica bairros homônimos nas sugestões, sem somar seus totais aos municípios", () => {
    const sugestoes = sugerirLocais("centro", cidades, 8, localidades);
    expect(sugestoes.map((s) => s.valor)).toEqual(["Centro — Brasília, DF", "Centro — Taguatinga, TO"]);
    expect(interpretarLocal("CENTRO — BRASILIA, DF", cidades, localidades)).toMatchObject({ cidade: "Brasília", uf: "DF", localidade: "Centro" });
    expect(sugerirLocais("", cidades, 8, localidades)[0]!.total).toBe(3);
    expect(sugerirLocais("taguatinga, df", cidades, 8, localidades)[0]!.valor).toBe("Taguatinga — Brasília, DF");
  });

  it("preserva a cidade inteira quando o nome termina como uma UF", () => {
    expect(interpretarLocal("Sento Sé", [{ cidade: "Sento Sé", uf: "BA", total: 1 }])).toEqual({ cidade: "Sento Sé", uf: "BA", rotulo: "Sento Sé, BA" });
  });
});
