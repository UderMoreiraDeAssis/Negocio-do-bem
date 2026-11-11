"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type SlideDeCidade = {
  cidade: string;
  uf: string;
  total: number;
  href: string;
  src: string;
  srcPequena: string;
  largura: number;
  alt: string;
};

const INTERVALO_MS = 5000;

/**
 * As fotos das cidades com mais negócios, na vitrine da página inicial. Troca sozinho a
 * cada poucos segundos e para com o mouse em cima ou com o foco dentro; para quem pediu
 * menos movimento, só troca pelos pontos. Sem JavaScript, fica a primeira cidade.
 */
export function CarrosselDeCidades({ cidades }: { cidades: SlideDeCidade[] }) {
  const [atual, setAtual] = useState(0);
  const [parado, setParado] = useState(false);
  const [poucoMovimento, setPoucoMovimento] = useState(true);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => setPoucoMovimento(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    if (parado || poucoMovimento || cidades.length < 2) return;
    const id = window.setTimeout(() => setAtual((i) => (i + 1) % cidades.length), INTERVALO_MS);
    return () => window.clearTimeout(id);
  }, [atual, parado, poucoMovimento, cidades.length]);

  if (cidades.length === 0) return null;

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Cidades com mais negócios"
      className="relative overflow-hidden rounded-[1.75rem] lg:ml-[9%]"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setParado(false);
      }}
    >
      <div className="relative aspect-[4/3] sm:aspect-[16/9] lg:aspect-[4/4.4]">
        {cidades.map((cidade, i) => {
          const ativa = i === atual;
          return (
            <Link
              key={cidade.href}
              href={cidade.href}
              aria-roledescription="slide"
              aria-label={`${cidade.cidade}, ${cidade.uf}: ${cidade.total.toLocaleString("pt-BR")} ${cidade.total === 1 ? "negócio do bem" : "negócios do bem"} (${i + 1} de ${cidades.length})`}
              inert={!ativa}
              className={`group absolute inset-0 block transition-opacity duration-700 ${ativa ? "opacity-100" : "opacity-0"}`}
            >
              {/* As fotos já estão reduzidas, em dois tamanhos (ver scripts/fotos-das-cidades.ts). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cidade.src}
                srcSet={`${cidade.srcPequena} 800w, ${cidade.src} ${cidade.largura}w`}
                sizes="(min-width: 64rem) 30rem, calc(100vw - 2rem)"
                alt={cidade.alt}
                fetchPriority={i === 0 ? "high" : "low"}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <span className="absolute bottom-5 left-5 text-white">
                <span className="block font-display text-2xl font-bold tracking-tight">
                  {cidade.cidade}, {cidade.uf}
                </span>
                <span className="text-sm text-white/85">
                  {cidade.total.toLocaleString("pt-BR")} {cidade.total === 1 ? "negócio do bem" : "negócios do bem"}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      {cidades.length > 1 && (
        <div className="absolute right-4 bottom-5 flex gap-1.5">
          {cidades.map((cidade, i) => (
            <button
              key={cidade.href}
              type="button"
              aria-label={`Mostrar ${cidade.cidade}, ${cidade.uf}`}
              aria-current={i === atual ? "true" : undefined}
              onClick={() => setAtual(i)}
              className="grid h-6 w-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className={`block h-1.5 rounded-full bg-white transition-all ${i === atual ? "w-5" : "w-1.5 opacity-60"}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
