import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  COTA_GERAL_POR_MINUTO,
  COTA_POR_ORIGEM,
  consultarCep,
  IDADE_MAXIMA_MS,
  INEXISTENTE_VALE_MS,
  limparCopiasVencidas,
  PAUSA_INICIAL_MS,
  REVALIDAR_APOS_MS,
} from "@/lib/cep";
import { db } from "@/lib/db";

const ORIGEM = "203.0.113.5";
const PRACA_DA_SE = { cep: "01001-000", logradouro: "Praça da Sé", bairro: "Sé", localidade: "São Paulo", uf: "SP" };

const chamadas = vi.fn<(url: string) => Promise<Response>>();

function responderCom(corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) {
  chamadas.mockImplementation(async () => new Response(JSON.stringify(corpo), { status, headers: cabecalhos }));
}

async function limparBanco() {
  await db.$executeRawUnsafe(`TRUNCATE "CepConsultado", "CotaCep", "PausaProvedorCep"`);
}

async function envelhecerCopia(cep: string, idadeMs: number) {
  await db.cepConsultado.update({ where: { cep }, data: { consultadoEm: new Date(Date.now() - idadeMs) } });
}

async function encerrarPausa() {
  await db.pausaProvedorCep.updateMany({ data: { pausadoAte: new Date(Date.now() - 1000) } });
}

beforeEach(async () => {
  await limparBanco();
  chamadas.mockReset();
  vi.stubGlobal("fetch", (url: string) => chamadas(url));
  vi.stubEnv("CEP_CONSULTA", "viacep");
  vi.stubEnv("CEP_ARMAZENAMENTO_AUTORIZADO", "1");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("consulta de CEP", () => {
  it("fica desligada sem CEP_CONSULTA e não chama o ViaCEP", async () => {
    vi.stubEnv("CEP_CONSULTA", "");
    expect(await consultarCep("01001-000", ORIGEM)).toEqual({ situacao: "desligada" });
    expect(chamadas).not.toHaveBeenCalled();
  });

  it("exige a configuração de armazenamento autorizado antes de consultar", async () => {
    vi.stubEnv("CEP_ARMAZENAMENTO_AUTORIZADO", "");
    expect(await consultarCep("01001000", ORIGEM)).toEqual({ situacao: "desligada" });
    expect(chamadas).not.toHaveBeenCalled();
    expect(await db.cotaCep.count()).toBe(0);
  });

  it("recusa formato inválido sem consultar nem contar", async () => {
    expect(await consultarCep("0100-100", ORIGEM)).toEqual({ situacao: "invalido" });
    expect(chamadas).not.toHaveBeenCalled();
    expect(await db.cotaCep.count()).toBe(0);
  });

  it("guarda o CEP encontrado e responde as próximas consultas pela cópia", async () => {
    responderCom(PRACA_DA_SE);
    const primeira = await consultarCep("01001000", ORIGEM);
    expect(primeira).toMatchObject({ situacao: "encontrado", aConfirmar: false, endereco: { cidade: "São Paulo", bairro: "Sé" } });
    expect(await consultarCep("01001-000", ORIGEM)).toEqual(primeira);
    expect(chamadas).toHaveBeenCalledTimes(1);
    expect(chamadas.mock.calls[0]![0]).toBe("https://viacep.com.br/ws/01001000/json/");
  });

  it("revalida a cópia vencida no uso", async () => {
    responderCom(PRACA_DA_SE);
    await consultarCep("01001000", ORIGEM);
    await envelhecerCopia("01001000", REVALIDAR_APOS_MS + 1000);
    responderCom({ ...PRACA_DA_SE, logradouro: "Praça da Sé, lado ímpar" });
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ endereco: { logradouro: "Praça da Sé, lado ímpar" }, aConfirmar: false });
    expect(chamadas).toHaveBeenCalledTimes(2);
  });

  it("guarda o CEP inexistente por pouco tempo", async () => {
    responderCom({ erro: "true" });
    expect(await consultarCep("99999999", ORIGEM)).toEqual({ situacao: "inexistente" });
    expect(await consultarCep("99999999", ORIGEM)).toEqual({ situacao: "inexistente" });
    expect(chamadas).toHaveBeenCalledTimes(1);
    await envelhecerCopia("99999999", INEXISTENTE_VALE_MS + 1000);
    await consultarCep("99999999", ORIGEM);
    expect(chamadas).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["erro 500", () => responderCom({}, 500)],
    ["resposta inválida", () => responderCom({ cep: "00000-000" })],
    ["rede fora do ar", () => chamadas.mockRejectedValue(new TypeError("fetch failed"))],
  ])("com %s, responde indisponível e não grava inexistência", async (_caso, preparar) => {
    preparar();
    expect(await consultarCep("01001000", ORIGEM)).toEqual({ situacao: "indisponivel" });
    expect(await db.cepConsultado.count()).toBe(0);
  });

  it("depois de uma falha, pausa as chamadas para todas as consultas", async () => {
    responderCom({}, 502);
    await consultarCep("01001000", ORIGEM);
    responderCom(PRACA_DA_SE);
    expect(await consultarCep("01001000", "198.51.100.7")).toEqual({ situacao: "indisponivel" });
    expect(chamadas).toHaveBeenCalledTimes(1);
    const pausa = await db.pausaProvedorCep.findUniqueOrThrow({ where: { provedor: "viacep" } });
    expect(pausa.pausadoAte.getTime() - Date.now()).toBeGreaterThan(PAUSA_INICIAL_MS * 0.9);

    await encerrarPausa();
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ situacao: "encontrado" });
    expect(await db.pausaProvedorCep.count()).toBe(0);
  });

  it("respeita o Retry-After de um 429 e aumenta a pausa a cada falha seguida", async () => {
    responderCom({}, 429, { "Retry-After": "600" });
    await consultarCep("01001000", ORIGEM);
    const primeira = await db.pausaProvedorCep.findUniqueOrThrow({ where: { provedor: "viacep" } });
    expect(primeira.pausadoAte.getTime() - Date.now()).toBeGreaterThan(590_000);

    await encerrarPausa();
    responderCom({}, 500);
    await consultarCep("01001000", ORIGEM);
    const segunda = await db.pausaProvedorCep.findUniqueOrThrow({ where: { provedor: "viacep" } });
    expect(segunda.falhasSeguidas).toBe(2);
    expect(segunda.pausadoAte.getTime() - Date.now()).toBeGreaterThan(2 * PAUSA_INICIAL_MS * 0.9);
  });

  it("sem o ViaCEP, usa a cópia vencida como dado a confirmar até a idade máxima", async () => {
    responderCom(PRACA_DA_SE);
    await consultarCep("01001000", ORIGEM);
    await envelhecerCopia("01001000", REVALIDAR_APOS_MS + 1000);
    responderCom({}, 503);
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ situacao: "encontrado", aConfirmar: true });
    expect((await db.cepConsultado.findUniqueOrThrow({ where: { cep: "01001000" } })).situacao).toBe("encontrado");

    await encerrarPausa();
    await envelhecerCopia("01001000", IDADE_MAXIMA_MS + 1000);
    expect(await consultarCep("01001000", ORIGEM)).toEqual({ situacao: "indisponivel" });
  });

  it("limita as consultas de cada origem, inclusive as respondidas pela cópia", async () => {
    responderCom(PRACA_DA_SE);
    for (let i = 0; i < COTA_POR_ORIGEM; i++) await consultarCep("01001000", ORIGEM);
    expect(await consultarCep("01001000", ORIGEM)).toEqual({ situacao: "limite" });
    expect(await consultarCep("01001000", "198.51.100.7")).toMatchObject({ situacao: "encontrado" });
    expect(chamadas).toHaveBeenCalledTimes(1);
  });

  it("sem IP conhecido, as origens dividem uma cota só", async () => {
    responderCom(PRACA_DA_SE);
    for (let i = 0; i < COTA_POR_ORIGEM; i++) await consultarCep("01001000", null);
    expect(await consultarCep("01001000", null)).toEqual({ situacao: "limite" });
  });

  it("para de chamar o ViaCEP quando a cota geral do minuto acaba", async () => {
    responderCom({ erro: true });
    for (let i = 0; i < COTA_GERAL_POR_MINUTO; i++) {
      await consultarCep(`0100${String(i).padStart(4, "0")}`, `198.51.100.${i}`);
    }
    expect(await consultarCep("02000000", "192.0.2.1")).toEqual({ situacao: "indisponivel" });
    expect(chamadas).toHaveBeenCalledTimes(COTA_GERAL_POR_MINUTO);
  });

  it("unifica consultas iguais e simultâneas numa chamada só", async () => {
    let liberar!: () => void;
    chamadas.mockImplementation(
      () => new Promise((resolver) => (liberar = () => resolver(new Response(JSON.stringify(PRACA_DA_SE))))),
    );
    const consultas = [consultarCep("01001000", "198.51.100.1"), consultarCep("01001000", "198.51.100.2")];
    await vi.waitFor(() => expect(chamadas).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 200));
    liberar();
    const resultados = await Promise.all(consultas);
    expect(resultados.every((r) => r.situacao === "encontrado")).toBe(true);
    expect(chamadas).toHaveBeenCalledTimes(1);
  });

  it("unifica consultas de processos separados usando a trava do PostgreSQL", async () => {
    const executar = promisify(execFile);
    const codigo = `
      const { consultarCep } = require('./src/lib/cep.ts');
      const { db } = require('./src/lib/db.ts');
      global.fetch = async () => {
        console.log('CHAMADA_EXTERNA');
        await new Promise(r => setTimeout(r, 300));
        return new Response(JSON.stringify(${JSON.stringify(PRACA_DA_SE)}));
      };
      consultarCep('01001000', process.env.ORIGEM_TESTE)
        .then(r => console.log(JSON.stringify(r)))
        .finally(() => db.$disconnect());
    `;
    const resultados = await Promise.all(["198.51.100.31", "198.51.100.32"].map((origem) => executar(
      process.execPath, ["--conditions=react-server", "--import", "tsx", "--eval", codigo],
      { env: { ...process.env, ORIGEM_TESTE: origem } },
    )));
    expect(resultados.every((r) => r.stdout.includes('"situacao":"encontrado"'))).toBe(true);
    expect(resultados.flatMap((r) => r.stdout.match(/CHAMADA_EXTERNA/g) ?? [])).toHaveLength(1);
  }, 15_000);

  it("falha de leitura permite preenchimento manual sem consultar o provedor", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.cepConsultado, "findUnique").mockRejectedValueOnce(new Error("armazenamento fora do ar"));
    expect(await consultarCep("01001000", ORIGEM)).toEqual({ situacao: "indisponivel" });
    expect(chamadas).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Consulta de CEP indisponível: falha no armazenamento ou na coordenação.");
  });

  it("falha de gravação preserva a última cópia, a cota e permite retomar", async () => {
    responderCom(PRACA_DA_SE);
    await consultarCep("01001000", ORIGEM);
    await envelhecerCopia("01001000", REVALIDAR_APOS_MS + 1000);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.cepConsultado, "upsert").mockRejectedValueOnce(new Error("gravação interrompida"));
    responderCom({ ...PRACA_DA_SE, logradouro: "Logradouro atualizado" });
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ aConfirmar: true, endereco: { logradouro: "Praça da Sé" } });
    expect((await db.cepConsultado.findUniqueOrThrow({ where: { cep: "01001000" } })).logradouro).toBe("Praça da Sé");
    expect((await db.cotaCep.findMany()).every((c) => c.contagem === 2)).toBe(true);
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ aConfirmar: false, endereco: { logradouro: "Logradouro atualizado" } });
  });

  it("resposta inválida e timeout mantêm a última cópia íntegra", async () => {
    responderCom(PRACA_DA_SE);
    await consultarCep("01001000", ORIGEM);
    await envelhecerCopia("01001000", REVALIDAR_APOS_MS + 1000);
    responderCom({ ...PRACA_DA_SE, uf: "SP-invalida" });
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ aConfirmar: true });
    await encerrarPausa();
    chamadas.mockRejectedValue(new DOMException("demorou", "TimeoutError"));
    expect(await consultarCep("01001000", ORIGEM)).toMatchObject({ aConfirmar: true });
    expect((await db.cepConsultado.findUniqueOrThrow({ where: { cep: "01001000" } })).logradouro).toBe("Praça da Sé");
  });

  it("exclui cópias vencidas em lotes limitados sem apagar a cópia ainda utilizável", async () => {
    await db.cepConsultado.createMany({ data: Array.from({ length: 101 }, (_, i) => ({
      cep: String(i).padStart(8, "0"), situacao: "encontrado", fonte: "viacep", consultadoEm: new Date(Date.now() - IDADE_MAXIMA_MS - 10_000),
    })) });
    await db.cepConsultado.create({ data: { cep: "01001000", situacao: "encontrado", fonte: "viacep", consultadoEm: new Date() } });
    expect(await limparCopiasVencidas()).toBe(100);
    expect(await limparCopiasVencidas()).toBe(1);
    expect(await db.cepConsultado.count()).toBe(1);
  });
});
