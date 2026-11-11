"use client";

import { useEffect, useState } from "react";

/**
 * Número que sobe de 60% até o valor ao abrir a página. Sem JavaScript, ou para
 * quem pede menos movimento no sistema, aparece direto o valor final.
 */
export function Contador({ valor }: { valor: number }) {
  const [atual, setAtual] = useState(valor);

  useEffect(() => {
    if (valor === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const inicio = performance.now();
    const partida = Math.round(valor * 0.6);
    let quadro = 0;
    const passo = (agora: number) => {
      const progresso = Math.min(1, (agora - inicio) / 1200);
      setAtual(Math.round(partida + (valor - partida) * (1 - (1 - progresso) ** 3)));
      if (progresso < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  return (
    <>
      <span className="sr-only">{valor.toLocaleString("pt-BR")}</span>
      <span aria-hidden="true" className="tabular-nums">
        {atual.toLocaleString("pt-BR")}
      </span>
    </>
  );
}
