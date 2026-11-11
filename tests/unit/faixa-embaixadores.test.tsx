import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RostoNaFaixa } from "@/components/FaixaEmbaixadores";
import type { EmbaixadorNoSite } from "@/lib/embaixadores";

const faixaRolante = readFileSync(new URL("../../src/components/FaixaRolante.tsx", import.meta.url), "utf8");

const embaixador: EmbaixadorNoSite = {
  id: "e1",
  nome: "Ana Lima",
  instagramUsername: "ana.lima",
  fotoUrl: null,
  seguidores: "12 mil",
  numeroDeSeguidores: 12000,
  titulo: "Embaixadora do bem",
  cidade: "Recife",
  uf: "PE",
  lugar: "Recife, PE",
  naInicial: true,
  destino: { href: "/cidades/recife-pe", detalhe: "Negócios em Recife" },
  href: "/embaixadores/ana.lima",
  sobre: null,
};

function links(html: string) {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
}

describe("faixa dos embaixadores", () => {
  it("o rosto da faixa leva à página e ao lugar, na ordem do Tab", () => {
    const html = renderToStaticMarkup(<RostoNaFaixa embaixador={embaixador} />);
    expect(links(html)).toHaveLength(2);
    expect(html).toContain('href="/embaixadores/ana.lima"');
    expect(html).toContain('href="/cidades/recife-pe"');
    expect(html).not.toContain("tabindex");
  });

  it("na cópia do laço, os mesmos links ficam fora do Tab", () => {
    const html = renderToStaticMarkup(<RostoNaFaixa embaixador={embaixador} naCopia />);
    const naCopia = links(html);
    expect(naCopia).toHaveLength(2);
    for (const link of naCopia) expect(link).toContain('tabindex="-1"');
    expect(html).toContain('href="/embaixadores/ana.lima"');
    expect(html).toContain('href="/cidades/recife-pe"');
  });

  it("a cópia fica fora do leitor de tela, mas continua clicável", () => {
    // Com inert, os rostos repetidos não abriam nada, e boa parte da faixa na tela é a cópia.
    const copia = faixaRolante.match(/<ul[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/ul>/)?.[0];
    expect(copia).toBeDefined();
    expect(copia).not.toMatch(/\binert\b/);
    expect(copia).toContain("{copia}");
  });
});
