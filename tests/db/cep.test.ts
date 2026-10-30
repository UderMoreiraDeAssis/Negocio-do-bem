import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COTA_GERAL_POR_MINUTO,
  COTA_POR_ORIGEM,
  consultarCep,
  IDADE_MAXIMA_MS,
  INEXISTENTE_VALE_MS,
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
});

afterEach(() => {
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
});
