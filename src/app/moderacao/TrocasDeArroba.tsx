import Link from "next/link";
import { Suspense } from "react";
import { aprovarTrocaDeArrobaAcao, recusarTrocaDeArrobaAcao } from "@/acoes/arroba";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { LinkInstagram } from "@/components/LinkInstagram";
import { db } from "@/lib/db";
import { buscarPreviaDoInstagram } from "@/lib/previa-instagram";
import { formatarDataHora } from "@/lib/texto";

/**
 * A fila das trocas de @: os donos que pediram para mudar o @ do negócio. Cada pedido traz
 * o que a Meta mostra do @ novo, para a moderação conferir se a conta é mesmo do negócio.
 * O mais antigo vem primeiro.
 */
export async function TrocasDeArroba() {
  const pedidos = await db.trocaDeArroba.findMany({
    where: { status: "pendente" },
    orderBy: { criadoEm: "asc" },
    take: 50,
    include: {
      usuario: { select: { id: true, nome: true, email: true } },
      empresa: { select: { nome: true, instagramUsername: true, cidade: true, uf: true, site: true } },
    },
  });
  if (pedidos.length === 0) return <p className="cartao p-8 text-center text-suave">Nenhum pedido de troca do @ esperando. 🎉</p>;

  return (
    <div id="pedidos" className="scroll-mt-24 space-y-4">
      <p className="text-sm leading-relaxed text-suave">
        Abra o @ novo no Instagram e confira se é a conta do negócio: nome, cidade e site. Aprovado, o endereço da página muda e o
        antigo passa a levar ao novo.
      </p>
      {pedidos.map((pedido) => (
        <article key={pedido.id} className="cartao space-y-4 p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/empresas/${pedido.empresa.instagramUsername}`} className="font-display text-2xl font-semibold hover:text-coral-700">
                {pedido.empresa.nome}
              </Link>
              <p className="text-sm text-suave">
                {pedido.empresa.cidade}/{pedido.empresa.uf}
                {pedido.empresa.site && <> · {pedido.empresa.site}</>}
              </p>
            </div>
            <p className="text-right text-sm text-suave">pedido em {formatarDataHora(pedido.criadoEm)}</p>
          </header>

          <p className="text-lg">
            <LinkInstagram endereco={pedido.arrobaAntigo} seta /> <span className="text-suave">→</span>{" "}
            <LinkInstagram endereco={pedido.arrobaNovo} seta />
          </p>

          <Suspense fallback={<p className="text-sm text-suave">Procurando @{pedido.arrobaNovo} na Meta…</p>}>
            <PreviaDoNovo arroba={pedido.arrobaNovo} />
          </Suspense>

          <p className="text-sm">
            <span className="text-suave">Pedido por:</span>{" "}
            <Link href={`/moderacao/contas/${pedido.usuario.id}`} className="font-semibold hover:text-coral-700 hover:underline">
              {pedido.usuario.nome}
            </Link>{" "}
            ({pedido.usuario.email})
          </p>

          <div className="flex flex-col gap-3 border-t border-linha pt-4 sm:flex-row sm:items-start sm:justify-between">
            <form action={aprovarTrocaDeArrobaAcao}>
              <input type="hidden" name="trocaId" value={pedido.id} />
              <BotaoEnviar className="botao-coral botao-pequeno" enviando="Trocando…">
                Aprovar a troca
              </BotaoEnviar>
            </form>
            <form action={recusarTrocaDeArrobaAcao} className="flex flex-1 gap-2 sm:max-w-md">
              <input type="hidden" name="trocaId" value={pedido.id} />
              <label htmlFor={`recusa-${pedido.id}`} className="sr-only">
                Motivo da recusa
              </label>
              <input
                id={`recusa-${pedido.id}`}
                name="motivo"
                maxLength={500}
                placeholder="Motivo da recusa (o dono vê)"
                className="campo py-1.5 sm:text-sm"
              />
              <BotaoEnviar className="botao-claro botao-pequeno" enviando="…">
                Recusar
              </BotaoEnviar>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}

/** O que a Meta mostra do @ novo. Só contas profissionais aparecem. */
async function PreviaDoNovo({ arroba }: { arroba: string }) {
  const previa = await buscarPreviaDoInstagram(arroba);
  if (!previa) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        A Meta não mostra @{arroba}: é conta pessoal, privada ou não existe. Sem conta profissional, o perfil fica sem a foto do
        Instagram.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-superficie p-3 text-sm">
      {previa.foto && (
        // A foto chega em data URL (ver src/lib/previa-instagram.ts).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa.foto} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
      )}
      <div className="min-w-0">
        <p className="font-semibold">{previa.nome ?? `@${arroba}`}</p>
        <p className="break-all text-suave">
          {previa.site ?? "sem site no perfil"}
          {previa.seguidores !== null && <> · {previa.seguidores.toLocaleString("pt-BR")} seguidores</>}
        </p>
      </div>
    </div>
  );
}
