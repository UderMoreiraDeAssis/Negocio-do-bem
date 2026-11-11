"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { CHAVE_TEMA, temaPreferido, type Tema } from "@/lib/tema";

const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function temaDaPagina(): Tema {
  return document.documentElement.getAttribute("data-tema") === "escuro" ? "escuro" : "claro";
}

function aplicar(tema: Tema) {
  document.documentElement.setAttribute("data-tema", tema);
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** Switch do modo escuro. A bolinha muda pelo CSS (escuro:), então não pisca ao carregar. */
export function AlternarTema() {
  const tema = useSyncExternalStore(assinar, temaDaPagina, () => "claro" as Tema);

  // Em desenvolvimento o React remonta a página e limpa o data-tema do <html>
  // que o script do layout colocou; aqui ele volta. Em produção não muda nada.
  useLayoutEffect(() => aplicar(temaPreferido()), []);

  function alternar() {
    const novo: Tema = tema === "escuro" ? "claro" : "escuro";
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch {
      // Sem localStorage, o tema muda só nesta visita.
    }
    aplicar(novo);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={tema === "escuro"}
      aria-label="Modo escuro"
      title={tema === "escuro" ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
      onClick={alternar}
      className="relative inline-flex h-6 w-10 shrink-0 items-center sm:h-7 sm:w-12 rounded-full border border-linha bg-areia transition hover:border-tinta/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
    >
      <span
        aria-hidden="true"
        className="absolute left-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-superficie text-tinta shadow-sm ring-1 ring-linha transition-transform escuro:translate-x-4 sm:h-5.5 sm:w-5.5 sm:escuro:translate-x-5"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3 escuro:hidden sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg viewBox="0 0 24 24" className="hidden h-3 w-3 escuro:block sm:h-3.5 sm:w-3.5" fill="currentColor">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
        </svg>
      </span>
    </button>
  );
}
