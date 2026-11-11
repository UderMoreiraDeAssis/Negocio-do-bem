import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { maisQueridos } from "@/lib/consultas";
import { db } from "@/lib/db";

async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE "RegistroAuditoria", "EmpresaFavorita", "Depoimento", "Reivindicacao", "EmpresaMembro", "EmpresaCausa", "Empresa", "Sessao", "Usuario" CASCADE`,
  );
}

function criar(username: string, dados: { moderacao?: string; oculta?: boolean } = {}) {
  return db.empresa.create({
    data: { instagramUsername: username, nome: username, resumo: "Um negócio do bem", categoria: "Café e padaria", cidade: "Recife", uf: "PE", moderacao: "aprovada", ...dados },
  });
}

async function pessoas(quantas: number) {
  return Promise.all(
    Array.from({ length: quantas }, (_, i) =>
      db.usuario.create({ data: { nome: `Pessoa ${i}`, email: `pessoa${i}@exemplo.com`, senhaHash: "scrypt$segredo" } }),
    ),
  );
}

async function favoritar(empresaId: string, usuarios: { id: string }[], criadoEm = new Date()) {
  await db.empresaFavorita.createMany({ data: usuarios.map((u) => ({ empresaId, usuarioId: u.id, criadoEm })) });
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("maisQueridos", () => {
  it("ordena pelos favoritos, com o número de cada um, e deixa de fora quem não tem nenhum", async () => {
    const gente = await pessoas(3);
    const um = await criar("um");
    const tres = await criar("tres");
    await criar("nenhum");
    await favoritar(um.id, gente.slice(0, 1));
    await favoritar(tres.id, gente);

    const { maisFavoritados } = await maisQueridos();
    expect(maisFavoritados.map((e) => [e.instagramUsername, e._count.favoritos])).toEqual([
      ["tres", 3],
      ["um", 1],
    ]);
  });

  it("só conta negócios do diretório e só depoimentos publicados", async () => {
    const gente = await pessoas(2);
    const publicado = await criar("publicado");
    const pendente = await criar("pendente", { moderacao: "pendente" });
    const oculto = await criar("oculto", { oculta: true });
    await favoritar(pendente.id, gente);
    await favoritar(oculto.id, gente);
    await db.depoimento.create({ data: { empresaId: publicado.id, autorId: gente[0].id, texto: "Muito bom." } });
    await db.depoimento.create({ data: { empresaId: publicado.id, autorId: gente[1].id, texto: "Removido.", status: "removido" } });
    await db.depoimento.create({ data: { empresaId: pendente.id, autorId: gente[0].id, texto: "Fora do diretório." } });

    const { maisFavoritados, maisDepoimentos } = await maisQueridos();
    expect(maisFavoritados).toEqual([]);
    expect(maisDepoimentos.map((e) => [e.instagramUsername, e._count.depoimentos])).toEqual([["publicado", 1]]);
  });

  it("no empate, põe primeiro quem recebeu o último favorito, e respeita o limite", async () => {
    const [ana, bia] = await pessoas(2);
    const antigo = await criar("antigo");
    const recente = await criar("recente");
    const terceiro = await criar("terceiro");
    await favoritar(antigo.id, [ana], new Date("2026-01-01"));
    await favoritar(recente.id, [bia], new Date("2026-06-01"));
    await favoritar(terceiro.id, [ana], new Date("2026-03-01"));

    const { maisFavoritados } = await maisQueridos(2);
    expect(maisFavoritados.map((e) => e.instagramUsername)).toEqual(["recente", "terceiro"]);
  });
});
