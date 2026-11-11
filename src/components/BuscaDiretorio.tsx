import Form from "next/form";
import { CampoOnde } from "@/components/CampoOnde";
import { SEM_FILTROS, slugCategoria, type CidadeComNegocios, type FiltrosDiretorio } from "@/lib/diretorio";

/**
 * A busca da página inicial e do diretório: "O que você procura?" + "Onde?". Leva
 * para /explorar; lá, guarda os outros filtros marcados em campos escondidos.
 */
export function BuscaDiretorio({
  cidades,
  filtros = SEM_FILTROS,
}: {
  cidades: CidadeComNegocios[];
  filtros?: FiltrosDiretorio;
}) {
  return (
    <Form
      action="/explorar"
      role="search"
      className="flex flex-wrap gap-1 rounded-[1.75rem] border border-linha bg-superficie p-1.5 shadow-flutuante sm:flex-nowrap sm:rounded-full"
    >
      {filtros.tipos.map((tipo) => (
        <input key={tipo} type="hidden" name="tipo" value={slugCategoria(tipo)} />
      ))}
      {filtros.causas.map((causa) => (
        <input key={causa} type="hidden" name="causa" value={causa} />
      ))}
      {filtros.verificados && <input type="hidden" name="verificados" value="sim" />}
      {filtros.ordem !== SEM_FILTROS.ordem && <input type="hidden" name="ordem" value={filtros.ordem} />}
      {filtros.vista !== SEM_FILTROS.vista && <input type="hidden" name="vista" value={filtros.vista} />}

      <label className="flex min-w-0 flex-[3_1_18rem] cursor-text items-center gap-3.5 rounded-full px-5 py-2.5 transition focus-within:bg-areia">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-suave" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" />
        </svg>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold text-tinta">O que você procura?</span>
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            maxLength={100}
            placeholder="Padaria, brechó, pet shop, yoga…"
            className="w-full truncate border-0 bg-transparent p-0 text-base text-tinta placeholder:text-suave focus:outline-none"
          />
        </span>
      </label>

      {/* A key recria o campo quando o "Onde?" muda pela URL (ao tirar o filtro, por exemplo). */}
      <CampoOnde key={filtros.onde} cidades={cidades} valorInicial={filtros.onde} />

      <button type="submit" className="botao-coral min-h-13 flex-[1_0_auto] rounded-full px-7 text-base sm:aspect-square sm:flex-[0_0_auto] sm:px-0">
        <span className="sm:sr-only">Buscar</span>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" />
        </svg>
      </button>
    </Form>
  );
}
