import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { destaquesDaVitrine } from "@/lib/consultas";
import { db } from "@/lib/db";

async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE "RegistroAuditoria", "EmpresaFavorita", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`,
  );
}

function criar(username: string, dados: { fotoUrl?: string | null; moderacao?: string; oculta?: boolean } = {}) {
  return db.empresa.create({
    data: {
      instagramUsername: username,
      nome: username,
      resumo: "Um negócio do bem",
      categoria: "Café e padaria",
      cidade: "Recife",
      uf: "PE",
      moderacao: "aprovada",
      fotoUrl: `/enviados/${username}.jpg`,
      ...dados,
    },
  });
}

async function favoritar(empresaId: string, quantas: number) {
  for (let i = 0; i < quantas; i++) {
    const usuario = await db.usuario.create({
      data: { nome: `Pessoa ${empresaId}${i}`, email: `${empresaId}-${i}@exemplo.com`, senhaHash: "scrypt$segredo" },
    });
    await db.empresaFavorita.create({ data: { empresaId, usuarioId: usuario.id } });
  }
}

/** Um gerador previsível, para o teste não depender da sorte. */
function semente(valor: number) {
  return () => {
    valor = (valor * 1103515245 + 12345) % 2147483648;
    return valor / 2147483648;
  };
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("destaquesDaVitrine", () => {
  it("prefere os negócios com favoritos e depoimentos, e varia a cada sorteio", async () => {
    const querido = await criar("querido");
    const tambem = await criar("tambem");
    await criar("novo");
    await favoritar(querido.id, 3);
    await favoritar(tambem.id, 1);

    const aleatorio = semente(3);
    const vezes = new Map<string, number>();
    for (let i = 0; i < 40; i++) {
      const [primeiro] = await destaquesDaVitrine(1, aleatorio);
      vezes.set(primeiro.instagramUsername, (vezes.get(primeiro.instagramUsername) ?? 0) + 1);
    }
    // "novo" não tem favorito nem depoimento: só entraria para completar.
    expect(vezes.has("novo")).toBe(false);
    expect(vezes.get("querido")).toBeGreaterThan(vezes.get("tambem") ?? 0);
    expect(vezes.get("tambem")).toBeGreaterThan(0);
  });

  it("completa com outros negócios com foto e deixa de fora quem não aparece no diretório ou não tem foto", async () => {
    const querido = await criar("querido");
    await favoritar(querido.id, 1);
    await criar("comfoto");
    await criar("semfoto", { fotoUrl: null });
    await criar("fotodefora", { fotoUrl: "https://exemplo.com/foto.jpg" });
    const pendente = await criar("pendente", { moderacao: "pendente" });
    await favoritar(pendente.id, 5);

    const destaques = await destaquesDaVitrine(2);
    expect(destaques.map((e) => e.instagramUsername)).toEqual(["querido", "comfoto"]);
  });
});
