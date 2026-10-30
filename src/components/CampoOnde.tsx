"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { sugerirLocais, type CidadeComNegocios, type LocalidadeComNegocios, type SugestaoLocal } from "@/lib/diretorio";

/**
 * O "Onde?" da busca: sugere estados, cidades e subdivisões com negócios e envia
 * o texto escolhido no campo `onde` (inclusive "Centro — Recife, PE"). Sem
 * JavaScript, é um campo de texto comum, e o servidor entende o que foi digitado.
 */
export function CampoOnde({ cidades, localidades = [], valorInicial }: { cidades: CidadeComNegocios[]; localidades?: LocalidadeComNegocios[]; valorInicial: string }) {
  const [texto, setTexto] = useState(valorInicial);
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(0);
  const lista = useId();

  const sugestoes = aberta ? sugerirLocais(texto, cidades, 8, localidades) : [];
  const destacada = Math.min(ativa, sugestoes.length - 1);
  const nenhuma = aberta && texto.trim().length > 0 && sugestoes.length === 0;

  function escolher(sugestao: SugestaoLocal) {
    setTexto(sugestao.valor);
    setAberta(false);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      setAberta(true);
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setAtiva(Math.max(0, Math.min(destacada + passo, sugestoes.length - 1)));
    } else if (evento.key === "Enter" && sugestoes[destacada]) {
      // Escolhe a sugestão em vez de enviar a busca.
      evento.preventDefault();
      escolher(sugestoes[destacada]);
    } else if (evento.key === "Escape") {
      setAberta(false);
    }
  }

  return (
    <div className="relative min-w-0 flex-[2_1_15rem]">
      <label className="flex cursor-text items-center gap-3.5 rounded-2xl bg-papel px-4 py-3 transition focus-within:bg-coral-50">
        <IconePino />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold text-suave">Onde?</span>
          <input
            name="onde"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setAberta(true);
              setAtiva(0);
            }}
            onFocus={() => setAberta(true)}
            onBlur={() => setAberta(false)}
            onKeyDown={aoTeclar}
            placeholder="Todo o Brasil"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={sugestoes.length > 0}
            aria-controls={lista}
            aria-activedescendant={sugestoes.length > 0 ? `${lista}-${destacada}` : undefined}
            className="w-full border-0 bg-transparent p-0 text-[17px] text-tinta placeholder:text-suave focus:outline-none"
          />
        </span>
        {texto && (
          <button
            type="button"
            onClick={() => setTexto("")}
            aria-label="Limpar o lugar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linha text-tinta transition hover:bg-linha/70"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </label>
      <ul
        id={lista}
        role="listbox"
        aria-label={texto.trim() ? "Cidades, estados, regiões e bairros" : "Onde já temos negócios"}
        className={`absolute z-30 mt-2.5 max-h-96 w-full min-w-72 overflow-auto rounded-3xl border border-linha bg-superficie p-2 shadow-2xl shadow-tinta/15 ${sugestoes.length > 0 ? "" : "hidden"}`}
      >
        {!texto.trim() && (
          <li role="presentation" className="px-3 pt-2 pb-1.5 text-xs font-semibold tracking-wide text-suave uppercase">
            Onde já temos negócios
          </li>
        )}
        {sugestoes.map((sugestao, i) => (
          <li
            key={`${sugestao.tipo}-${sugestao.valor}`}
            id={`${lista}-${i}`}
            role="option"
            aria-selected={i === destacada}
            // mousedown, e não click, para escolher antes de o campo perder o foco.
            onMouseDown={(evento) => {
              evento.preventDefault();
              escolher(sugestao);
            }}
            onMouseMove={() => setAtiva(i)}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 ${i === destacada ? "bg-coral-50" : ""}`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-papel text-coral-700">
              {sugestao.tipo === "cidade" || sugestao.tipo === "localidade" ? <IconePino /> : <IconeMapa />}
            </span>
            <span className="min-w-0 flex-1 text-[15px]">
              <span className="font-semibold">{sugestao.nome}</span>{" "}
              <span className="text-suave">{sugestao.detalhe}</span>
            </span>
            <span className={`text-xs font-semibold whitespace-nowrap ${sugestao.total > 0 ? "text-folha" : "text-suave"}`}>
              {sugestao.total > 0 ? `${sugestao.total} ${sugestao.total === 1 ? "negócio" : "negócios"}` : "nenhum ainda"}
            </span>
          </li>
        ))}
      </ul>
      {nenhuma && (
        <p className="absolute z-30 mt-2.5 w-full rounded-3xl border border-linha bg-superficie px-4 py-3 text-sm text-suave shadow-2xl shadow-tinta/15">
          Ainda não temos negócios num lugar com esse nome.
        </p>
      )}
    </div>
  );
}

function IconePino() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-coral-700" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
    </svg>
  );
}

function IconeMapa() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6ZM9 4v14M15 6v14" />
    </svg>
  );
}
