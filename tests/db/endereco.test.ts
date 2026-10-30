import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { db } from "@/lib/db";
import { buscarDiretorio, cidadeDoSlug, listarCidades, listarLocalidades } from "@/lib/consultas";
import { SEM_FILTROS } from "@/lib/diretorio";
import { CAMPOS_ENDERECO } from "@/lib/endereco";
import { textoDeBusca } from "@/lib/texto";

const sessao = vi.hoisted(() => ({ usuario: { id: "", moderador: false, emailConfirmado: true } }));
class Redirecionou extends Error {}
vi.mock("@/lib/auth/sessao", () => ({
  exigirUsuario: async () => sessao.usuario,
  caminhoSeguro: (_valor: unknown, padrao: string) => padrao,
}));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Redirecionou(destino); } }));

const { indicarEmpresa, salvarEmpresa } = await import("@/acoes/empresas");

async function limpar() {
  await db.$executeRawUnsafe('TRUNCATE "RegistroAuditoria", "Empresa", "Usuario" CASCADE');
}

beforeEach(async () => {
  await limpar();
  const usuario = await db.usuario.create({ data: { nome: "Pessoa de Teste", email: "endereco@exemplo.com", senhaHash: "x" } });
  sessao.usuario = { id: usuario.id, moderador: false, emailConfirmado: true };
});

afterAll(async () => { await limpar(); await db.$disconnect(); });

function formulario(campos: Record<string, string> = {}) {
  const base = {
    ...Object.fromEntries(CAMPOS_ENDERECO.map((c) => [c, ""])),
    instagram: "negocio.endereco", nome: "Loja de Teste", categoria: "Serviços", municipio: "Brasília, DF", resumo: "Um negócio com endereço de teste",
    ...campos,
  };
  const dados = new FormData();
  for (const [campo, valor] of Object.entries(base)) dados.set(campo, valor);
  return dados;
}

async function negocio(username: string, extras: Record<string, string | boolean | null> = {}) {
  const campos = { nome: "Loja de Teste", resumo: "Um negócio do bem", categoria: "Serviços", cidade: "Brasília", uf: "DF", instagramUsername: username, ...extras };
  return db.empresa.create({ data: { moderacao: "aprovada", ...campos, busca: textoDeBusca(campos) } });
}

describe("endereço nas ações de indicação e edição", () => {
  it("guarda os campos e o CEP com zero inicial, mas uma indicação não autoriza sua publicação", async () => {
    const dados = formulario({ regiaoAdministrativa: "ceilandia", bairro: "Setor Norte", localidade: "Área comercial", cep: "01001-000", logradouro: "QNN 1, conjunto A", numero: "12B", complemento: "Bloco C, lote 4", enderecoPublico: "sim", souDono: "sim" });
    await expect(indicarEmpresa(undefined, dados)).rejects.toThrow(Redirecionou);
    expect(await db.empresa.findUniqueOrThrow({ where: { instagramUsername: "negocio.endereco" } })).toMatchObject({
      cidade: "Brasília", uf: "DF", regiaoAdministrativa: "Ceilândia", bairro: "Setor Norte", localidade: "Área comercial", cep: "01001000", logradouro: "QNN 1, conjunto A", numero: "12B", complemento: "Bloco C, lote 4", enderecoPublico: false,
    });
    expect((await buscarDiretorio({ ...SEM_FILTROS, q: "CEILANDIA" })).total).toBe(1);
  });

  it("devolve todos os campos após erro e não grava um CEP ou região inválidos", async () => {
    const dados = formulario({ municipio: "Taguatinga, TO", regiaoAdministrativa: "Taguatinga", cep: "123", numero: "s/n", complemento: "Perto da praça" });
    const estado = await indicarEmpresa(undefined, dados);
    expect(estado?.erros).toHaveProperty("cep");
    expect(estado?.valores).toMatchObject({ cep: "123", numero: "s/n", complemento: "Perto da praça", regiaoAdministrativa: "Taguatinga" });
    dados.set("cep", "");
    expect((await indicarEmpresa(undefined, dados))?.erros).toHaveProperty("regiaoAdministrativa");
    expect(await db.empresa.count()).toBe(0);
  });

  it.each([false, true])("dono/moderação (moderador=%s) enriquece e publica o endereço de um cadastro antigo", async (moderador) => {
    const empresa = await negocio("antiga");
    expect(empresa).toMatchObject({ regiaoAdministrativa: null, cep: null, enderecoPublico: false });
    sessao.usuario.moderador = moderador;
    if (!moderador) await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: sessao.usuario.id } });
    const dados = formulario({ empresaId: empresa.id, regiaoAdministrativa: "Águas Claras", bairro: "Norte", cep: "71900000", logradouro: "Quadra 1", numero: "s/n", enderecoPublico: "sim" });
    await expect(salvarEmpresa(undefined, dados)).rejects.toThrow(Redirecionou);
    expect(await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).toMatchObject({ regiaoAdministrativa: "Águas Claras", bairro: "Norte", numero: "s/n", enderecoPublico: true });
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "aguas claras, DF" })).total).toBe(1);
    expect(await db.registroAuditoria.findFirst({ where: { alvoId: empresa.id } })).toMatchObject({ acao: moderador ? "empresa.editada_pela_moderacao" : "empresa.editada" });

    dados.set("regiaoAdministrativa", "Ponte Alta");
    dados.delete("enderecoPublico");
    await expect(salvarEmpresa(undefined, dados)).rejects.toThrow(Redirecionou);
    expect((await buscarDiretorio({ ...SEM_FILTROS, q: "aguas claras" })).total).toBe(0);
    expect((await buscarDiretorio({ ...SEM_FILTROS, q: "ponte alta" })).total).toBe(1);
    expect((await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).enderecoPublico).toBe(false);
  });

  it("recusa edição e publicação do endereço por quem não é dono nem moderação", async () => {
    const empresa = await negocio("alheia");
    await expect(salvarEmpresa(undefined, formulario({ empresaId: empresa.id, regiaoAdministrativa: "Taguatinga", enderecoPublico: "sim" }))).rejects.toThrow("/painel");
    expect(await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).toEqual(empresa);
    expect(await db.registroAuditoria.count()).toBe(0);
  });

  it("um erro de edição preserva o banco e os dados enviados", async () => {
    const empresa = await negocio("dona", { regiaoAdministrativa: "Taguatinga", numero: "10A" });
    await db.empresaMembro.create({ data: { empresaId: empresa.id, usuarioId: sessao.usuario.id } });
    const resultado = await salvarEmpresa(undefined, formulario({ empresaId: empresa.id, regiaoAdministrativa: "Taguatinga", municipio: "Taguatinga, TO", numero: "12B", complemento: "Bloco 2", enderecoPublico: "sim" }));
    expect(resultado).toMatchObject({ erros: { regiaoAdministrativa: expect.any(String) }, valores: { numero: "12B", complemento: "Bloco 2", enderecoPublico: "sim" } });
    expect(await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } })).toEqual(empresa);
  });

  it("permite indicação rural fora do DF, sem CEP nem logradouro", async () => {
    await expect(indicarEmpresa(undefined, formulario({ municipio: "Recife, PE", localidade: "Sítio das Flores", numero: "s/n" }))).rejects.toThrow(Redirecionou);
    expect(await db.empresa.findUniqueOrThrow({ where: { instagramUsername: "negocio.endereco" } })).toMatchObject({ cidade: "Recife", uf: "PE", localidade: "Sítio das Flores", numero: "s/n", cep: null, logradouro: null });
  });
});

describe("localização no diretório", () => {
  it("a correção de cidades antigas preserva a busca por região/bairro e a data de atualização", async () => {
    const empresa = await negocio("grafia.antiga", { cidade: "brasilia", regiaoAdministrativa: "Ceilândia", bairro: "São José", localidade: "Área Rural" });
    execFileSync(process.execPath, ["--import", "tsx", "scripts/corrigir-cidades.ts", "--aplicar"], { env: process.env, stdio: "pipe" });
    const corrigida = await db.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(corrigida.cidade).toBe("Brasília");
    expect(corrigida.atualizadoEm).toEqual(empresa.atualizadoEm);
    expect(corrigida.busca).toContain("ceilandia sao jose area rural");
    expect((await buscarDiretorio({ ...SEM_FILTROS, q: "ceilandia" })).total).toBe(1);
  });

  it("separa Taguatinga/DF e TO, combinando filtros e contagens sem alterar páginas municipais", async () => {
    await negocio("df", { regiaoAdministrativa: "Taguatinga", bairro: "Centro" });
    await negocio("to", { cidade: "Taguatinga", uf: "TO", bairro: "Centro" });
    await negocio("ceilandia", { regiaoAdministrativa: "Ceilândia", categoria: "Pet" });
    await negocio("oculta", { regiaoAdministrativa: "Taguatinga", oculta: true });
    await negocio("rejeitada", { regiaoAdministrativa: "Taguatinga", moderacao: "rejeitada" });
    // O resumo contém DF, mas não transforma o município tocantinense em parte do DF.
    await negocio("homonima", { cidade: "Taguatinga", uf: "TO", resumo: "Envios para DF" });

    const df = await buscarDiretorio({ ...SEM_FILTROS, onde: "Taguatinga, DF" });
    expect(df.itens.map((e) => e.instagramUsername)).toEqual(["df"]);
    expect(df.porCategoria).toEqual({ Serviços: 1 });
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "Taguatinga, TO" })).total).toBe(2);
    expect((await buscarDiretorio({ ...SEM_FILTROS, q: "TAGUATINGA, DF" })).total).toBe(1);
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "ceilandia", tipos: ["Pet"] })).total).toBe(1);
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "Taguatinga, DF", tipos: ["Pet"] })).total).toBe(0);
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "Brasília, DF" })).total).toBe(2);
    expect(await cidadeDoSlug("brasilia-df")).toMatchObject({ total: 2 });
    expect(await cidadeDoSlug("taguatinga-to")).toMatchObject({ total: 2 });
    expect(await listarCidades()).toHaveLength(2);
  });

  it("normaliza bairros e localidades e conta uma vez quando os campos repetem o nome", async () => {
    await negocio("um", { bairro: "São José", localidade: "São José" });
    await negocio("dois", { bairro: "sao jose" });
    await negocio("outro", { cidade: "Recife", uf: "PE", bairro: "São José" });
    await negocio("rural", { cidade: "Recife", uf: "PE", localidade: "Comunidade Rural" });
    const locais = await listarLocalidades();
    expect(locais.filter((l) => l.uf === "DF")).toEqual([expect.objectContaining({ cidade: "Brasília", total: 2 })]);
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "SAO JOSE — BRASILIA, DF" })).total).toBe(2);
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "sao jose — recife, pe" })).total).toBe(1);
    expect((await buscarDiretorio({ ...SEM_FILTROS, onde: "COMUNIDADE RURAL" })).total).toBe(1);
    expect((await buscarDiretorio({ ...SEM_FILTROS, q: "sao jose" })).total).toBe(3);
  });

  it("não inclui detalhes postais privados no texto de busca", async () => {
    await negocio("reservada", { cep: "01001000", logradouro: "Via Sigilosa", complemento: "Bloco Secreto", numero: "13A" });
    for (const q of ["01001000", "sigilosa", "secreto", "13A"]) expect((await buscarDiretorio({ ...SEM_FILTROS, q })).total).toBe(0);
  });
});
