import { NextResponse, type NextRequest } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { usuarioAtual } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { lerDocumento } from "@/lib/documentos";
import { condicaoDeTalentoPublico, podeVerContatosDeTalentos } from "@/lib/talentos";

/**
 * O currículo de um perfil do banco de talentos (#347). Abre para a própria pessoa, para a
 * moderação e para donos de negócios do diretório (estes, só com o perfil aberto e ativo).
 * Qualquer outra pessoa recebe 404. Cada abertura por outra conta fica na auditoria.
 */
export async function GET(_requisicao: NextRequest, contexto: RouteContext<"/api/talentos/[id]/curriculo">) {
  const naoEncontrado = () => new NextResponse("Não encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
  const usuario = await usuarioAtual();
  if (!usuario) return naoEncontrado();
  const { id } = await contexto.params;
  const talento = await db.talento.findUnique({
    where: { id },
    select: { usuarioId: true, nome: true, curriculoChave: true, curriculoNome: true, aberto: true, status: true },
  });
  if (!talento?.curriculoChave) return naoEncontrado();
  const propria = talento.usuarioId === usuario.id;
  const publico = talento.aberto === condicaoDeTalentoPublico().aberto && talento.status === condicaoDeTalentoPublico().status;
  if (!propria && !usuario.moderador && !(publico && (await podeVerContatosDeTalentos(usuario)))) return naoEncontrado();
  const arquivo = await lerDocumento(talento.curriculoChave);
  if (!arquivo) return naoEncontrado();

  if (!propria) {
    await registrarAuditoria(db, {
      usuarioId: usuario.id,
      acao: "talento.curriculo_visto",
      alvoTipo: "usuario",
      alvoId: talento.usuarioId,
      detalhes: talento.nome,
    });
  }
  const nome = (talento.curriculoNome ?? "curriculo").replace(/[^\w.\- ]+/g, "_");
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
