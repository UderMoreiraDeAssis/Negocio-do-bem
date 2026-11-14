import { NextResponse, type NextRequest } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { usuarioAtual } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { lerDocumento } from "@/lib/documentos";

/**
 * O currículo de uma candidatura (#339). Só abre quem é dono do negócio da vaga ou a moderação;
 * qualquer outra pessoa recebe 404, sem saber se o arquivo existe. Cada abertura fica na
 * auditoria. A resposta nunca vai para cache e não aceita ser embutida.
 */
export async function GET(_requisicao: NextRequest, contexto: RouteContext<"/api/curriculos/[id]">) {
  const naoEncontrado = () => new NextResponse("Não encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
  const usuario = await usuarioAtual();
  if (!usuario) return naoEncontrado();
  const { id } = await contexto.params;
  const candidatura = await db.candidatura.findUnique({
    where: { id },
    select: {
      curriculoChave: true,
      curriculoNome: true,
      nome: true,
      vaga: { select: { empresaId: true, empresa: { select: { instagramUsername: true, membros: { where: { usuarioId: usuario.id }, select: { usuarioId: true } } } } } },
    },
  });
  if (!candidatura?.curriculoChave) return naoEncontrado();
  if (!usuario.moderador && candidatura.vaga.empresa.membros.length === 0) return naoEncontrado();
  const arquivo = await lerDocumento(candidatura.curriculoChave);
  if (!arquivo) return naoEncontrado();

  await registrarAuditoria(db, {
    usuarioId: usuario.id,
    acao: "candidatura.curriculo_visto",
    alvoTipo: "empresa",
    alvoId: candidatura.vaga.empresaId,
    detalhes: `@${candidatura.vaga.empresa.instagramUsername} · ${candidatura.nome}`,
  });
  const nome = (candidatura.curriculoNome ?? "curriculo").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(arquivo.conteudo as BodyInit, {
    headers: {
      "Content-Type": arquivo.tipo,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Robots-Tag": "noindex",
    },
  });
}
