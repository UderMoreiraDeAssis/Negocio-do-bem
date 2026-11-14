import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  alternarAberto,
  apagarTalento,
  condicaoDeFiltrosDeTalentos,
  esquemaDoTalento,
  filtrosDeTalentosDaUrl,
  MAXIMO_DE_HABILIDADES,
  moderarTalento,
  podeVerContatosDeTalentos,
  salvarTalento,
  separarHabilidades,
  type DadosDoTalento,
} from "@/lib/talentos";

async function limparBanco() {
  await db.$executeRawUnsafe(`TRUNCATE "RegistroAuditoria", "Talento", "EmpresaMembro", "Empresa", "Usuario" CASCADE`);
}

const formulario = {
  nome: "Tina Talento",
  titulo: "Confeiteira com 5 anos de experiência",
  sobre: "Trabalhei em duas padarias de bairro, cuidando de bolos, tortas e encomendas de festa.",
  procura: "Vaga de confeitaria pela manhã",
  habilidades: "Confeitaria, atendimento, confeitaria , Excel",
  areas: ["alimentacao", "inventada"],
  contratos: ["clt", "freela"],
  modalidades: ["presencial"],
  municipio: "Recife, PE",
  email: "Tina@Exemplo.com",
  whatsapp: "(81) 99999-1234",
  link: "linkedin.com/in/tina",
  aberto: "sim",
  consentimento: "sim",
};

const dados = (extra: Partial<DadosDoTalento> = {}): DadosDoTalento => ({
  nome: "Tina Talento",
  titulo: "Confeiteira com 5 anos de experiência",
  sobre: "Trabalhei em duas padarias de bairro, cuidando de bolos, tortas e encomendas de festa.",
  procura: "Vaga de confeitaria pela manhã",
  habilidades: ["Confeitaria", "Atendimento"],
  areas: ["alimentacao"],
  contratos: ["clt"],
  modalidades: ["presencial"],
  cidade: "Recife",
  uf: "PE",
  email: "tina@exemplo.com",
  whatsapp: null,
  link: null,
  aberto: true,
  ...extra,
});

let tina: { id: string };
let dona: { id: string };
let visitante: { id: string };

beforeEach(async () => {
  await limparBanco();
  tina = await db.usuario.create({ data: { nome: "Tina", email: "tina@exemplo.com" } });
  dona = await db.usuario.create({ data: { nome: "Dora Dona", email: "dora@exemplo.com" } });
  visitante = await db.usuario.create({ data: { nome: "Vera", email: "vera@exemplo.com" } });
  await db.empresa.create({
    data: {
      instagramUsername: "padaria.flor",
      nome: "Padaria Flor",
      resumo: "Um negócio do bem",
      categoria: "Café e padaria",
      cidade: "Recife",
      uf: "PE",
      moderacao: "aprovada",
      status: "verificada",
      busca: "padaria flor",
      membros: { create: { usuarioId: dona.id } },
    },
  });
});

describe("esquemaDoTalento", () => {
  it("aceita um perfil completo, tira repetidas e opções que não existem", () => {
    const resultado = esquemaDoTalento.safeParse(formulario);
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data).toMatchObject({
      habilidades: ["Confeitaria", "atendimento", "Excel"],
      areas: ["alimentacao"],
      cidade: "Recife",
      uf: "PE",
      email: "tina@exemplo.com",
      whatsapp: "5581999991234",
      link: "https://linkedin.com/in/tina",
      aberto: true,
    });
  });

  it("exige consentimento, uma área e pelo menos uma habilidade", () => {
    expect(esquemaDoTalento.safeParse({ ...formulario, consentimento: "" }).success).toBe(false);
    expect(esquemaDoTalento.safeParse({ ...formulario, areas: ["inventada"] }).success).toBe(false);
    expect(esquemaDoTalento.safeParse({ ...formulario, habilidades: " , ; " }).success).toBe(false);
  });

  it(`limita a ${MAXIMO_DE_HABILIDADES} habilidades`, () => {
    const muitas = Array.from({ length: MAXIMO_DE_HABILIDADES + 1 }, (_, i) => `Habilidade ${i}`).join(", ");
    expect(esquemaDoTalento.safeParse({ ...formulario, habilidades: muitas }).success).toBe(false);
  });

  it("recusa contato no texto público", () => {
    expect(esquemaDoTalento.safeParse({ ...formulario, sobre: `${formulario.sobre} Me chama no 81 99999-1234` }).success).toBe(false);
    expect(esquemaDoTalento.safeParse({ ...formulario, habilidades: "Confeitaria, tina@exemplo.com" }).success).toBe(false);
  });

  it("pausado quando a caixa não vem marcada", () => {
    const resultado = esquemaDoTalento.safeParse({ ...formulario, aberto: "nao" });
    expect(resultado.success && resultado.data.aberto).toBe(false);
  });
});

describe("separarHabilidades", () => {
  it("separa por vírgula, ponto e vírgula e linha, sem repetir acentos e maiúsculas", () => {
    expect(separarHabilidades("Inglês; ingles\nCaixa,  caixa ,")).toEqual(["Inglês", "Caixa"]);
  });
});

describe("salvarTalento", () => {
  it("cria uma vez por conta e depois atualiza, com a auditoria só na criação", async () => {
    const primeiro = await salvarTalento(tina.id, dados());
    expect(primeiro.criado).toBe(true);
    const segundo = await salvarTalento(tina.id, dados({ titulo: "Confeiteira e boleira" }));
    expect(segundo).toMatchObject({ id: primeiro.id, criado: false });
    expect(await db.talento.count()).toBe(1);
    expect((await db.talento.findUniqueOrThrow({ where: { id: primeiro.id } })).busca).toContain("boleira");
    expect(await db.registroAuditoria.count({ where: { acao: "talento.criado" } })).toBe(1);
  });

  it("troca o currículo e devolve o antigo para apagar; sem arquivo novo, mantém", async () => {
    const antigo = "a".repeat(32) + ".pdf";
    const novo = "b".repeat(32) + ".pdf";
    await salvarTalento(tina.id, dados(), { curriculo: { chave: antigo, nome: "cv.pdf" } });
    expect((await salvarTalento(tina.id, dados())).curriculoAntigo).toBeNull();
    expect((await db.talento.findUniqueOrThrow({ where: { usuarioId: tina.id } })).curriculoChave).toBe(antigo);
    expect((await salvarTalento(tina.id, dados(), { curriculo: { chave: novo, nome: "cv2.pdf" } })).curriculoAntigo).toBe(antigo);
    expect((await salvarTalento(tina.id, dados(), { removerCurriculo: true })).curriculoAntigo).toBe(novo);
    expect((await db.talento.findUniqueOrThrow({ where: { usuarioId: tina.id } })).curriculoChave).toBeNull();
  });
});

describe("base pública", () => {
  it("lista só perfis abertos e ativos, com os filtros", async () => {
    const { id } = await salvarTalento(tina.id, dados({ habilidades: ["Confeitaria", "Excel"] }));
    await salvarTalento(visitante.id, dados({ nome: "Vera", areas: ["tecnologia"], uf: "SP", cidade: "São Paulo" }));
    const ids = async (filtros: Parameters<typeof condicaoDeFiltrosDeTalentos>[0]) =>
      (await db.talento.findMany({ where: condicaoDeFiltrosDeTalentos(filtros), select: { id: true } })).map((t) => t.id);

    expect(await ids({})).toHaveLength(2);
    expect(await ids({ area: "alimentacao" })).toEqual([id]);
    expect(await ids({ uf: "PE", busca: "excel recife" })).toEqual([id]);
    expect(await ids({ busca: "EXCEL São" })).toEqual([]);

    await alternarAberto(tina.id, false);
    expect(await ids({ area: "alimentacao" })).toEqual([]);
    await alternarAberto(tina.id, true);
    await moderarTalento(id, dona.id, true, "Perfil falso");
    expect(await ids({ area: "alimentacao" })).toEqual([]);
    expect(await db.registroAuditoria.findFirst({ where: { acao: "talento.suspenso" } })).toMatchObject({ alvoId: tina.id, detalhes: "Tina Talento · Perfil falso" });
    await moderarTalento(id, dona.id, false, "");
    expect(await ids({ area: "alimentacao" })).toEqual([id]);
  });

  it("lê os filtros da URL só com valores conhecidos", () => {
    expect(filtrosDeTalentosDaUrl({ area: "alimentacao", contrato: "x", modalidade: "remoto", uf: "pe", busca: "  bolo " })).toEqual({
      busca: "bolo",
      area: "alimentacao",
      contrato: undefined,
      modalidade: "remoto",
      uf: "PE",
    });
  });
});

describe("podeVerContatosDeTalentos", () => {
  it("libera para donos de negócio aprovado e moderação, não para visitantes", async () => {
    expect(await podeVerContatosDeTalentos(null)).toBe(false);
    expect(await podeVerContatosDeTalentos({ id: visitante.id, moderador: false })).toBe(false);
    expect(await podeVerContatosDeTalentos({ id: visitante.id, moderador: true })).toBe(true);
    expect(await podeVerContatosDeTalentos({ id: dona.id, moderador: false })).toBe(true);
  });

  it("não libera para dono de negócio oculto ou não aprovado", async () => {
    await db.empresa.updateMany({ data: { oculta: true } });
    expect(await podeVerContatosDeTalentos({ id: dona.id, moderador: false })).toBe(false);
    await db.empresa.updateMany({ data: { oculta: false, moderacao: "pendente" } });
    expect(await podeVerContatosDeTalentos({ id: dona.id, moderador: false })).toBe(false);
  });
});

describe("apagarTalento", () => {
  it("apaga o perfil, devolve o currículo e registra", async () => {
    const chave = "c".repeat(32) + ".pdf";
    await salvarTalento(tina.id, dados(), { curriculo: { chave, nome: "cv.pdf" } });
    expect(await apagarTalento(tina.id)).toEqual({ curriculoChave: chave });
    expect(await db.talento.count()).toBe(0);
    expect(await db.registroAuditoria.count({ where: { acao: "talento.apagado" } })).toBe(1);
    expect(await apagarTalento(tina.id)).toBeNull();
  });
});
