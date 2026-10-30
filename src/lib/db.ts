import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

export type { Prisma } from "@/generated/prisma/client";

// Em desenvolvimento o Next recarrega os módulos a cada mudança; guardar o
// cliente no globalThis evita abrir um pool de conexões novo a cada recarga.
const cache = globalThis as unknown as { prisma?: PrismaClient };

function criarCliente() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = cache.prisma ?? criarCliente();

if (process.env.NODE_ENV !== "production") cache.prisma = db;

/**
 * Devolve null quando a escrita bate numa restrição de unicidade (P2002). As ações
 * consultam antes de criar, mas dois envios ao mesmo tempo passam juntos pela
 * consulta: quem chega depois cai aqui. Qualquer outro erro continua subindo.
 */
export async function semDuplicar<T>(escrita: Promise<T>): Promise<T | null> {
  try {
    return await escrita;
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return null;
    throw erro;
  }
}
