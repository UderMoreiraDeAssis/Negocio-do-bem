import "server-only";
import { timingSafeEqual } from "node:crypto";
import { apagarFoto, guardarFoto } from "@/lib/armazenamento";
import { registrarAuditoria } from "@/lib/auditoria";
import { db } from "@/lib/db";
import type { TipoDeFoto } from "@/lib/fotos";

// Fotos de perfil vindas do Instagram. Um script no computador de quem cuida do
// projeto (scripts/fotos-instagram.ts) busca a foto na API da Meta, deixa pronta
// e envia para /api/fotos-instagram. Aqui ficam as regras do lado do site.

/** Token que o script usa. Sem ele (ou curto demais), a rota responde 404. */
export function tokenDasFotos(): string | null {
  const token = process.env.FOTOS_TOKEN;
  return token && token.length >= 32 ? token : null;
}

/** Confere o cabeçalho "Authorization: Bearer <token>" sem vazar tempo de comparação. */
export function autorizado(cabecalho: string | null, token: string): boolean {
  const esperado = Buffer.from(`Bearer ${token}`);
  const recebido = Buffer.from(cabecalho ?? "");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Negócios sem foto que a rotina tenta preencher. Os tirados do ar ficam de fora. */
export function negociosSemFoto(limite = 200) {
  return db.empresa.findMany({
    where: { fotoUrl: null, moderacao: { not: "rejeitada" } },
    orderBy: { criadoEm: "asc" },
    take: limite,
    select: { id: true, instagramUsername: true },
  });
}

export type ResultadoFotoDoInstagram = "gravada" | "ja_tem_foto" | "nao_encontrado";

/**
 * Grava a foto vinda do Instagram, mas só se o negócio continuar sem foto: a
 * foto enviada pelo dono ou pela moderação nunca é trocada.
 */
export async function aplicarFotoDoInstagram(
  empresaId: string,
  foto: { arquivo: File; tipo: TipoDeFoto },
): Promise<ResultadoFotoDoInstagram> {
  const empresa = await db.empresa.findUnique({ where: { id: empresaId }, select: { fotoUrl: true, instagramUsername: true } });
  if (!empresa) return "nao_encontrado";
  if (empresa.fotoUrl) return "ja_tem_foto";

  const fotoUrl = await guardarFoto(foto, "perfis");
  // O dono pode ter enviado uma foto enquanto esta subia: nesse caso, vale a dele.
  // A foto e a auditoria são gravadas juntas. Se a transação falhar, a foto nova não
  // é apagada: sem saber se o commit aconteceu, apagar poderia deixar o perfil sem foto.
  const gravada = await db.$transaction(async (tx) => {
    const { count } = await tx.empresa.updateMany({ where: { id: empresaId, fotoUrl: null }, data: { fotoUrl } });
    if (count === 0) return false;
    await registrarAuditoria(tx, {
      usuarioId: null,
      acao: "empresa.foto_do_instagram",
      alvoTipo: "empresa",
      alvoId: empresaId,
      detalhes: `@${empresa.instagramUsername}`,
    });
    return true;
  });
  if (!gravada) {
    await apagarFoto(fotoUrl);
    return "ja_tem_foto";
  }
  return "gravada";
}
