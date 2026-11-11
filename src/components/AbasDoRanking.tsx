"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

type Aba = { id: string; rotulo: string; conteudo: ReactNode };

/**
 * As abas de "Os mais queridos" na página inicial. As duas listas já vêm prontas do
 * servidor; a aba só escolhe qual aparece. Sem JavaScript, fica a primeira.
 */
export function AbasDoRanking({ abas }: { abas: Aba[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.id);
  if (abas.length === 0) return null;

  // Setas e Home/End trocam de aba, como pede o padrão de abas da WAI-ARIA.
  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const destino = { ArrowRight: indice + 1, ArrowLeft: indice - 1, Home: 0, End: abas.length - 1 }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    const aba = abas[(destino + abas.length) % abas.length];
    setAtiva(aba.id);
    document.getElementById(`aba-${aba.id}`)?.focus();
  }
  return (
    <div className="flex flex-col gap-6">
      {abas.length > 1 && (
        <div role="tablist" aria-label="Ordenar os mais queridos" className="flex self-start rounded-full bg-areia p-1 max-sm:w-full">
          {abas.map((aba, indice) => (
            <button
              key={aba.id}
              type="button"
              role="tab"
              id={`aba-${aba.id}`}
              aria-selected={aba.id === ativa}
              tabIndex={aba.id === ativa ? 0 : -1}
              onKeyDown={(evento) => aoTeclar(evento, indice)}
              aria-controls={`painel-${aba.id}`}
              onClick={() => setAtiva(aba.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition max-sm:flex-1 ${
                aba.id === ativa ? "bg-superficie text-tinta shadow-cartao" : "text-suave hover:text-tinta"
              }`}
            >
              {aba.rotulo}
            </button>
          ))}
        </div>
      )}
      {abas.map((aba) => (
        <div key={aba.id} role="tabpanel" id={`painel-${aba.id}`} aria-labelledby={`aba-${aba.id}`} hidden={aba.id !== ativa}>
          {aba.conteudo}
        </div>
      ))}
    </div>
  );
}
