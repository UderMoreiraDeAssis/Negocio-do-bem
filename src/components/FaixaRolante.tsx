"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Uma faixa de itens que passa sozinha, num loop lento (a dos embaixadores, na
 * página inicial). Os itens vão duas vezes: quando a primeira volta sai pela
 * esquerda, a cópia está no mesmo lugar e a animação recomeça sem salto.
 *
 * A cópia (`copia`) são os mesmos itens com os links fora do Tab (`tabIndex={-1}`).
 * Ela fica fora do leitor de tela, mas recebe o clique: conforme a faixa anda, boa
 * parte do que está na tela é a cópia. Com `inert`, esses rostos não abriam nada.
 *
 * Só anda quando os itens não cabem na largura; cabendo, eles ficam parados e no
 * centro. Para com o mouse em cima, com o foco do teclado e com o botão "Pausar",
 * e fica parada para quem pede menos movimento no aparelho. Sem JavaScript, é uma
 * lista que rola para o lado.
 */
export function FaixaRolante({
  itens,
  copia,
  segundosPorItem = 5,
  className = "",
}: {
  itens: ReactNode[];
  copia: ReactNode[];
  segundosPorItem?: number;
  className?: string;
}) {
  const janela = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const [rolando, setRolando] = useState(false);
  const [pausada, setPausada] = useState(false);

  useEffect(() => {
    const medir = () => {
      if (janela.current && lista.current) setRolando(lista.current.scrollWidth > janela.current.clientWidth);
    };
    medir();
    const observador = new ResizeObserver(medir);
    if (janela.current) observador.observe(janela.current);
    return () => observador.disconnect();
  }, []);

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <div ref={janela} className={`faixa-janela py-2 ${rolando ? "faixa-mascara overflow-hidden motion-reduce:overflow-x-auto" : "overflow-x-auto"}`}>
        <div
          className={`flex w-max ${rolando ? "faixa-rolando" : "mx-auto"}`}
          style={{ "--duracao-da-faixa": `${itens.length * segundosPorItem}s` } as CSSProperties}
          data-pausada={pausada || undefined}
        >
          <ul ref={lista} className="flex gap-4 pr-4">
            {itens}
          </ul>
          {rolando && (
            <ul className="flex gap-4 pr-4 motion-reduce:hidden" aria-hidden="true">
              {copia}
            </ul>
          )}
        </div>
      </div>
      {rolando && (
        <button
          type="button"
          onClick={() => setPausada(!pausada)}
          className="inline-flex min-h-11 items-center gap-2 self-end rounded-full bg-areia px-4 text-[13px] font-semibold transition hover:bg-linha motion-reduce:hidden"
        >
          {pausada ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M9 5v14M15 5v14" />
            </svg>
          )}
          {pausada ? "Continuar" : "Pausar"}
        </button>
      )}
    </div>
  );
}
