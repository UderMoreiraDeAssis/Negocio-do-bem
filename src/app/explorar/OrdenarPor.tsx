import Link from "next/link";
import { ORDENS, type Ordem } from "@/lib/diretorio";

/** Seletor de ordenação: um menu com um link para cada ordem, e funciona antes de o JavaScript carregar. */
export function OrdenarPor({ atual, links }: { atual: Ordem; links: Record<Ordem, string> }) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-suave">
      <span id="rotulo-ordenar" className="max-sm:sr-only">Ordenar</span>
      <details key={atual} className="group relative">
        <summary
          aria-describedby="rotulo-ordenar"
          className="flex cursor-pointer list-none items-center gap-2 rounded-full bg-areia py-2 pr-3 pl-3 font-medium text-tinta [&::-webkit-details-marker]:hidden"
        >
          {ORDENS[atual]}
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-suave transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </summary>
        <ul className="absolute left-0 z-20 mt-2 w-max min-w-full rounded-2xl border border-linha bg-superficie p-1.5 shadow-lg sm:right-0 sm:left-auto">
          {(Object.keys(ORDENS) as Ordem[]).map((ordem) => (
            <li key={ordem}>
              <Link
                href={links[ordem]}
                scroll={false}
                aria-current={atual === ordem ? "true" : undefined}
                className={`flex items-center justify-between gap-4 rounded-xl px-3 py-2 transition hover:bg-areia ${
                  atual === ordem ? "font-semibold text-tinta" : "text-suave hover:text-tinta"
                }`}
              >
                {ORDENS[ordem]}
                {atual === ordem && (
                  <svg viewBox="0 0 20 20" className="h-4 w-4 text-coral" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
