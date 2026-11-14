import "server-only";
import path from "node:path";
import { db, type Prisma } from "@/lib/db";
import { registrarAuditoria } from "@/lib/auditoria";
import { chavesDaHistoria, chavesDaReferencia, identidadeDaFoto } from "@/lib/fotos-historias";
import { bloquearFotos, OPCOES_TRANSACAO_FOTOS } from "@/lib/publicacao-fotos";

export { ErroFotoDescartada, validarFotosDaHistoria } from "@/lib/publicacao-fotos";

export type ResultadoDescarte = {
  url: string;
  status: "candidata" | "preservada" | "descartada" | "bloqueada" | "falha";
};

export function objetoDaFoto(url: string): { dominio: string; chave: string } {
  const identidade = identidadeDaFoto(url);
  if (!identidade || ![...chavesDaReferencia(identidade)].some((chave) => chave.startsWith("historias/"))) {
    throw new Error("A foto não pertence ao domínio administrado de histórias.");
  }
  return identidade.startsWith("/enviados/")
    ? { dominio: `local:${path.resolve("public/enviados")}`, chave: identidade.slice("/enviados/".length) }
    : { dominio: new URL(identidade).origin, chave: new URL(identidade).pathname.slice(1) };
}

async function fotosEmUso(cliente: Pick<Prisma.TransactionClient, "empresa" | "reivindicacao" | "embaixador">): Promise<Set<string>> {
  const empresas = await cliente.empresa.findMany({ select: { historia: true, fotoUrl: true, site: true } });
  const reivindicacoes = await cliente.reivindicacao.findMany({ select: { site: true } });
  const embaixadores = await cliente.embaixador.findMany({ select: { fotoUrl: true } });
  const usadas = new Set<string>();
  for (const empresa of empresas) {
    for (const foto of chavesDaHistoria(empresa.historia)) usadas.add(foto);
    for (const foto of chavesDaReferencia(empresa.fotoUrl ?? "")) usadas.add(foto);
    for (const foto of chavesDaReferencia(empresa.site ?? "")) usadas.add(foto);
  }
  for (const reivindicacao of reivindicacoes) {
    for (const foto of chavesDaReferencia(reivindicacao.site ?? "")) usadas.add(foto);
  }
  for (const embaixador of embaixadores) {
    for (const foto of chavesDaReferencia(embaixador.fotoUrl ?? "")) usadas.add(foto);
  }
  return usadas;
}

/** Commit retirement before any storage request. Never remove a retirement record. */
export async function descartarFotos(
  urls: string[],
  excluir: (url: string) => Promise<void>,
  aplicar = false,
): Promise<ResultadoDescarte[]> {
  const identidades = urls.map(identidadeDaFoto);
  if (identidades.some((url) => url === null)) throw new Error("O inventário contém uma foto com identidade ambígua.");
  const candidatas = [...new Set(identidades as string[])];
  const objetos = new Map(candidatas.map((url) => [url, objetoDaFoto(url)]));
  if (aplicar && process.env.FOTOS_DOMINIO_EXCLUSIVO !== "confirmado") {
    return candidatas.map((url) => ({ url, status: "bloqueada" }));
  }
  if (!aplicar) {
    const usadas = await fotosEmUso(db);
    return candidatas.map((url) => ({ url, status: usadas.has(objetos.get(url)!.chave) ? "preservada" : "candidata" }));
  }

  const resultado = await db.$transaction(async (tx) => {
    await bloquearFotos(tx);
    const usadas = await fotosEmUso(tx);
    const registros: ResultadoDescarte[] = [];
    for (const url of candidatas) {
      const objeto = objetos.get(url)!;
      if (usadas.has(objeto.chave)) {
        registros.push({ url, status: "preservada" });
        continue;
      }
      const existente = await tx.fotoAposentada.findUnique({ where: { dominio_chave: objeto } });
      if (!existente) {
        await tx.fotoAposentada.create({ data: objeto });
        await registrarAuditoria(tx, { usuarioId: null, acao: "foto.descarte_iniciado", alvoTipo: "foto", alvoId: url });
      }
      registros.push({ url, status: "candidata" });
    }
    return registros;
  }, OPCOES_TRANSACAO_FOTOS);

  for (const foto of resultado) {
    if (foto.status !== "candidata") continue;
    try {
      await excluir(foto.url);
      await db.fotoAposentada.update({ where: { dominio_chave: objetos.get(foto.url)! }, data: { confirmadaEm: new Date() } });
      foto.status = "descartada";
    } catch (erro) {
      console.error("Não foi possível apagar a foto", foto.url, erro);
      foto.status = "falha";
    }
  }
  return resultado;
}
