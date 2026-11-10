import Link from "next/link";
import { after, connection } from "next/server";
import { IconeLugar, RostoDoEmbaixador } from "@/components/Embaixadores";
import { FaixaRolante } from "@/components/FaixaRolante";
import { NOMES_UF, type Uf } from "@/lib/dominio";
import { atualizarSeguidoresDoDia, embaixadoresNoSite, type EmbaixadorNoSite } from "@/lib/embaixadores";

/**
 * A faixa da página inicial, com os rostos dos embaixadores marcados para
 * ela passando sozinhos. Sem nenhum marcado, não aparece. Depois de responder,
 * atualiza os seguidores de quem não foi consultado no dia (src/lib/embaixadores.ts).
 */
export async function FaixaEmbaixadores() {
  // Na hora do pedido, nunca no build: o after abaixo não pode rodar na publicação.
  await connection();
  after(atualizarSeguidoresDoDia);
  const todos = await embaixadoresNoSite();
  const naFaixa = todos.filter((e) => e.naInicial);
  if (naFaixa.length === 0) return null;

  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Embaixadores do <span className="font-serif text-coral italic">bem</span>
          </h2>
          <p className="mt-2 leading-relaxed text-suave">Quem leva o Negócio do Bem para a própria cidade. Siga e veja os negócios de lá.</p>
        </div>
        <Link href="/embaixadores" className="botao-claro">
          {todos.length === 1 ? "Ver os embaixadores" : `Conhecer todos os ${todos.length}`} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <FaixaRolante
        className="mt-6"
        itens={naFaixa.map((e) => <RostoNaFaixa key={e.id} embaixador={e} />)}
        copia={naFaixa.map((e) => <RostoNaFaixa key={e.id} embaixador={e} naCopia />)}
      />
    </section>
  );
}

/** Na cópia do laço, os links continuam clicáveis, mas ficam fora do Tab. */
export function RostoNaFaixa({ embaixador, naCopia = false }: { embaixador: EmbaixadorNoSite; naCopia?: boolean }) {
  const semNegocios = embaixador.destino.href === "/participar";
  const foraDoTab = naCopia ? -1 : undefined;
  return (
    <li className="flex w-40 shrink-0 flex-col items-center gap-1 text-center">
      <Link href={embaixador.href} tabIndex={foraDoTab} className="group flex max-w-full flex-col items-center" title={`A página de ${embaixador.nome}`}>
        <RostoDoEmbaixador
          embaixador={embaixador}
          className="mb-3.5 h-21 w-21 text-[1.75rem] ring-2 ring-coral ring-offset-[3px] ring-offset-papel transition group-hover:ring-4"
        />
        <span className="max-w-full truncate text-sm font-semibold group-hover:underline">@{embaixador.instagramUsername}</span>
      </Link>
      {embaixador.seguidores && <span className="text-[13px] text-suave">{embaixador.seguidores} seguidores</span>}
      <Link
        href={embaixador.destino.href}
        tabIndex={foraDoTab}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-folha-50 px-3 text-[13px] font-semibold text-folha transition hover:bg-folha hover:text-papel"
      >
        <IconeLugar className="h-3.5 w-3.5 shrink-0" />
        <span className="sr-only">{semNegocios ? "Indicar um negócio em " : "Negócios em "}</span>
        <span className="truncate">{embaixador.cidade ?? `${NOMES_UF[embaixador.uf as Uf] ?? embaixador.uf} (estado)`}</span>
      </Link>
    </li>
  );
}
