import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { conferirCurriculo } from "@/lib/documentos";
import {
  candidatar,
  condicaoDeFiltros,
  condicaoDeVagaPublica,
  criarVaga,
  encerrarVaga,
  ErroCandidatura,
  ErroVaga,
  esquemaDaCandidatura,
  esquemaDaVaga,
  filtrosDaUrl,
  MAXIMO_DE_VAGAS_ABERTAS,
  moderarVaga,
  rotuloDoValor,
  type DadosVaga,
} from "@/lib/vagas";

async function limparBanco() {
  await db.$executeRawUnsafe(`TRUNCATE "RegistroAuditoria", "Candidatura", "Vaga", "EmpresaMembro", "Empresa", "Usuario" CASCADE`);
}

const HOJE = "2026-11-12";
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000);
const vaga = (extra: Partial<DadosVaga> = {}): DadosVaga => ({
  titulo: "Atendente de padaria",
  area: "alimentacao",
  contrato: "clt",
  modalidade: "presencial",
  descricao: "Atender o balcão, organizar a vitrine e fechar o caixa no fim do turno.",
  requisitos: "Gostar de gente.",
  beneficios: null,
  jornada: "Segunda a sexta, 6h às 12h",
  valorMin: 1800,
  valorMax: 2200,
  valorPeriodo: "mes",
  cidade: "Recife",
  uf: "PE",
  prazo: daqui(20),
  ...extra,
});

const dadosValidos = {
  titulo: "Atendente de padaria",
  area: "alimentacao",
  contrato: "clt",
  modalidade: "presencial",
  descricao: "Atender o balcão, organizar a vitrine e fechar o caixa no fim do turno.",
  requisitos: "Gostar de gente.",
  beneficios: "",
  jornada: "Segunda a sexta, 6h às 12h",
  valorMin: "1800",
  valorMax: "",
  valorPeriodo: "mes",
  municipio: "Recife, PE",
  ultimoDia: "2026-12-01",
  respeitaALei: "sim",
};

let dona: { id: string };
let estranha: { id: string };
let empresaId: string;

beforeEach(async () => {
  await limparBanco();
  dona = await db.usuario.create({ data: { nome: "Dora Dona", email: "dora@exemplo.com" } });
  estranha = await db.usuario.create({ data: { nome: "Eva Estranha", email: "eva@exemplo.com" } });
  const empresa = await db.empresa.create({
    data: {
      instagramUsername: "padaria.flor",
      nome: "Padaria Flor",
      resumo: "Um negócio do bem",
      categoria: "Café e padaria",
      cidade: "Recife",
      uf: "PE",
      moderacao: "aprovada",
      status: "verificada",
      busca: "padaria flor padaria.flor recife",
      membros: { create: { usuarioId: dona.id } },
    },
  });
  empresaId = empresa.id;
});

describe("esquemaDaVaga", () => {
  it("aceita uma vaga completa e guarda o valor e o município", () => {
    const resultado = esquemaDaVaga(HOJE).safeParse(dadosValidos);
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data).toMatchObject({ valorMin: 1800, valorMax: null, cidade: "Recife", uf: "PE" });
  });

  it("exige o valor", () => {
    const resultado = esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, valorMin: "" });
    expect(resultado.success).toBe(false);
  });

  it("recusa valor máximo menor que o mínimo", () => {
    expect(esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, valorMax: "1000" }).success).toBe(false);
  });

  it.each([
    ["link", "Mande o currículo em www.exemplo.com"],
    ["e-mail", "Escreva para rh@exemplo.com"],
    ["telefone", "Ligue 11991488052"],
    ["Pix", "Faça um pix antes"],
  ])("recusa %s no texto", (_nome, descricao) => {
    expect(esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, descricao: `${descricao} para vaga de atendente.` }).success).toBe(false);
  });

  it("recusa exigência discriminatória", () => {
    expect(esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, requisitos: "Boa aparência e até 30 anos." }).success).toBe(false);
  });

  it("recusa prazo no passado, prazo longo demais e falta do compromisso", () => {
    expect(esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, ultimoDia: "2026-11-01" }).success).toBe(false);
    expect(esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, ultimoDia: "2027-03-01" }).success).toBe(false);
    expect(esquemaDaVaga(HOJE).safeParse({ ...dadosValidos, respeitaALei: "" }).success).toBe(false);
  });
});

describe("criarVaga e encerrarVaga", () => {
  it("só um dono publica", async () => {
    await expect(criarVaga(empresaId, estranha.id, vaga())).rejects.toBeInstanceOf(ErroVaga);
    await expect(criarVaga(empresaId, dona.id, vaga())).resolves.toBeTruthy();
  });

  it("negócio fora do diretório não publica", async () => {
    await db.empresa.update({ where: { id: empresaId }, data: { oculta: true } });
    await expect(criarVaga(empresaId, dona.id, vaga())).rejects.toBeInstanceOf(ErroVaga);
  });

  it("limita as vagas abertas", async () => {
    for (let i = 0; i < MAXIMO_DE_VAGAS_ABERTAS; i++) await criarVaga(empresaId, dona.id, vaga());
    await expect(criarVaga(empresaId, dona.id, vaga())).rejects.toBeInstanceOf(ErroVaga);
  });

  it("registra na auditoria e só o dono encerra", async () => {
    const id = await criarVaga(empresaId, dona.id, vaga());
    expect(await db.registroAuditoria.count({ where: { acao: "vaga.criada" } })).toBe(1);
    expect(await encerrarVaga(id, estranha.id)).toBeNull();
    expect((await db.vaga.findUnique({ where: { id } }))?.status).toBe("aberta");
    expect(await encerrarVaga(id, dona.id)).toBe("padaria.flor");
    expect((await db.vaga.findUnique({ where: { id } }))?.status).toBe("encerrada");
  });
});

describe("vagas públicas e filtros", () => {
  it("só mostra vaga aberta, no prazo, de negócio visível", async () => {
    const aberta = await criarVaga(empresaId, dona.id, vaga());
    const vencida = await criarVaga(empresaId, dona.id, vaga({ prazo: daqui(-1) }));
    const encerrada = await criarVaga(empresaId, dona.id, vaga());
    await encerrarVaga(encerrada, dona.id);
    const ids = async () => (await db.vaga.findMany({ where: condicaoDeVagaPublica() })).map((v) => v.id);
    expect(await ids()).toEqual([aberta]);
    expect(vencida).toBeTruthy();
    await db.empresa.update({ where: { id: empresaId }, data: { oculta: true } });
    expect(await ids()).toEqual([]);
  });

  it("filtra por área, modalidade, estado e busca", async () => {
    await criarVaga(empresaId, dona.id, vaga());
    await criarVaga(empresaId, dona.id, vaga({ titulo: "Designer", area: "comunicacao", modalidade: "remoto", uf: "SP", cidade: "São Paulo" }));
    const quais = async (filtros: object) =>
      (await db.vaga.findMany({ where: condicaoDeFiltros(filtrosDaUrl(filtros as Record<string, string>)) })).map((v) => v.titulo);
    expect(await quais({ area: "comunicacao" })).toEqual(["Designer"]);
    expect(await quais({ modalidade: "presencial" })).toEqual(["Atendente de padaria"]);
    expect(await quais({ uf: "sp" })).toEqual(["Designer"]);
    expect(await quais({ busca: "padaria" })).toHaveLength(2);
    expect(await quais({ busca: "desig" })).toEqual(["Designer"]);
    expect(await quais({ area: "inventada" })).toHaveLength(2);
  });

  it("escreve o valor", () => {
    expect(rotuloDoValor({ valorMin: 1800, valorMax: 2200, valorPeriodo: "mes" })).toBe("R$ 1.800 a R$ 2.200 por mês");
    expect(rotuloDoValor({ valorMin: 50, valorMax: null, valorPeriodo: "dia" })).toBe("R$ 50 por dia");
  });
});

describe("candidatar", () => {
  const candidato = () =>
    esquemaDaCandidatura.parse({ nome: "Cris Candidata", email: "Cris@Exemplo.com", whatsapp: "", cidade: "Recife", link: "linkedin.com/in/cris", mensagem: "", consentimento: "sim" });

  it("registra com e-mail em minúsculas e link completo", async () => {
    const id = await criarVaga(empresaId, dona.id, vaga());
    const criada = await candidatar(id, null, candidato(), null);
    expect(await db.candidatura.findUnique({ where: { id: criada } })).toMatchObject({ email: "cris@exemplo.com", link: "https://linkedin.com/in/cris" });
  });

  it("recusa a segunda candidatura do mesmo e-mail", async () => {
    const id = await criarVaga(empresaId, dona.id, vaga());
    await candidatar(id, null, candidato(), null);
    await expect(candidatar(id, null, candidato(), null)).rejects.toMatchObject({ motivo: "repetida" });
  });

  it("exige currículo ou link", async () => {
    const id = await criarVaga(empresaId, dona.id, vaga());
    await expect(candidatar(id, null, { ...candidato(), link: null }, null)).rejects.toMatchObject({ motivo: "sem_curriculo" });
  });

  it("não aceita vaga encerrada, vencida ou suspensa", async () => {
    const encerrada = await criarVaga(empresaId, dona.id, vaga());
    await encerrarVaga(encerrada, dona.id);
    const vencida = await criarVaga(empresaId, dona.id, vaga({ prazo: daqui(-1) }));
    for (const id of [encerrada, vencida]) await expect(candidatar(id, null, candidato(), null)).rejects.toBeInstanceOf(ErroCandidatura);
    const suspensa = await criarVaga(empresaId, dona.id, vaga());
    await moderarVaga(suspensa, dona.id, true, "teste");
    await expect(candidatar(suspensa, null, candidato(), null)).rejects.toMatchObject({ motivo: "indisponivel" });
  });

  it("exige o consentimento", () => {
    expect(esquemaDaCandidatura.safeParse({ nome: "Cris Candidata", email: "cris@exemplo.com", whatsapp: "", cidade: "", link: "", mensagem: "", consentimento: "" }).success).toBe(false);
  });
});

describe("moderarVaga", () => {
  it("suspende, devolve e audita", async () => {
    const id = await criarVaga(empresaId, dona.id, vaga());
    expect(await moderarVaga(id, dona.id, true, "valor falso")).toBe(true);
    expect(await db.vaga.findUnique({ where: { id }, select: { status: true, motivo: true } })).toEqual({ status: "suspensa", motivo: "valor falso" });
    expect(await db.vaga.count({ where: condicaoDeVagaPublica() })).toBe(0);
    await moderarVaga(id, dona.id, false, "");
    expect(await db.vaga.count({ where: condicaoDeVagaPublica() })).toBe(1);
    expect(await db.registroAuditoria.count({ where: { acao: { in: ["vaga.suspensa", "vaga.reativada"] } } })).toBe(2);
  });
});

describe("conferirCurriculo", () => {
  const arquivo = (bytes: number[], nome = "cv") => new File([new Uint8Array([...bytes, 0, 0, 0, 0])], nome);
  it("aceita PDF, docx e doc pelos primeiros bytes", async () => {
    expect(await conferirCurriculo(arquivo([0x25, 0x50, 0x44, 0x46, 0x2d]))).toMatchObject({ documento: { tipo: "application/pdf" } });
    expect(await conferirCurriculo(arquivo([0x50, 0x4b, 0x03, 0x04]))).toMatchObject({ documento: { tipo: expect.stringContaining("wordprocessingml") } });
    expect(await conferirCurriculo(arquivo([0xd0, 0xcf, 0x11, 0xe0]))).toMatchObject({ documento: { tipo: "application/msword" } });
  });
  it("recusa outros formatos mesmo com extensão de PDF e aceita nenhum arquivo", async () => {
    expect(await conferirCurriculo(arquivo([0x4d, 0x5a, 0x90, 0x00], "cv.pdf"))).toHaveProperty("erro");
    expect(await conferirCurriculo(null)).toEqual({ documento: null });
    expect(await conferirCurriculo(new File([], "vazio.pdf"))).toEqual({ documento: null });
  });
  it("recusa arquivo grande demais", async () => {
    const grande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "cv.pdf");
    expect(await conferirCurriculo(grande)).toHaveProperty("erro");
  });
});
