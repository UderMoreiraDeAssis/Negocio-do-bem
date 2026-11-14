import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { chavesDaHistoria, chavesDaReferencia } from "@/lib/fotos-historias";

export const OPCOES_TRANSACAO_FOTOS = { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 60_000 } as const;

export class ErroFotoDescartada extends Error {
  constructor(readonly campo: "historia" | "fotoUrl" | "site" = "historia") {
    super("Uma foto deste conteúdo já entrou em descarte. Envie a foto novamente antes de salvar.");
  }
}

export async function bloquearFotos(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7346019)`;
}

/** Check references and publish them in the same transaction. */
export async function validarReferenciasFotos(
  tx: Prisma.TransactionClient,
  campos: { historia?: string; fotoUrl?: string | null; site?: string | null },
): Promise<void> {
  const chaves = new Set([
    ...chavesDaHistoria(campos.historia ?? ""),
    ...chavesDaReferencia(campos.fotoUrl ?? ""),
    ...chavesDaReferencia(campos.site ?? ""),
  ]);
  if (!chaves.size) return;
  await bloquearFotos(tx);
  // Match keys across domains to preserve unknown aliases.
  const aposentada = await tx.fotoAposentada.findFirst({ where: { chave: { in: [...chaves] } }, select: { chave: true } });
  if (aposentada) {
    const campo = chavesDaHistoria(campos.historia ?? "").has(aposentada.chave) ? "historia"
      : chavesDaReferencia(campos.site ?? "").has(aposentada.chave) ? "site" : "fotoUrl";
    throw new ErroFotoDescartada(campo);
  }
}

export async function validarFotosDaHistoria(tx: Prisma.TransactionClient, historia: string): Promise<void> {
  await validarReferenciasFotos(tx, { historia });
}

/** Keep the migration comparison and reference admission in one transaction. */
export async function migrarReferenciasFotos(
  cliente: Pick<PrismaClient, "$transaction">,
  anterior: { id: string; historia: string; fotoUrl: string | null },
  nova: { historia: string; fotoUrl: string | null },
) {
  return cliente.$transaction(async (tx) => {
    await validarReferenciasFotos(tx, nova);
    return tx.empresa.updateMany({ where: anterior, data: nova });
  }, OPCOES_TRANSACAO_FOTOS);
}
