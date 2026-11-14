import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chavesDaReferencia, chavesDaHistoria, fotosDaHistoria, identidadeDaFoto } from "@/lib/fotos-historias";

const FOTO = "https://fotos.exemplo.com/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://fotos.exemplo.com"));
afterEach(() => vi.unstubAllEnvs());

describe("referências das fotos", () => {
  it.each([
    `![Foto](${FOTO})`,
    `![Foto](<${FOTO}>)`,
    `![Foto][imagem]\n\n[imagem]: ${FOTO}?x=1&amp;y=2#legenda "Legenda"`,
    `[Arquivo](${FOTO}#arquivo)`,
    `<${FOTO}>`,
    `![Foto](${FOTO.replace("/aaaaaaaa", "/%61aaaaaaa")})`,
    `![Foto](${FOTO}?x=%)`,
    `![Foto](${FOTO}?x=..)`,
    `![Foto](${FOTO.replace("https://", "https://usuario@")})`,
    `![Foto](${FOTO.replace(".com/", ".com:444/")})`,
    `![Foto](${FOTO.replace("/historias/", "/perfis/../historias/")})`,
    `[reservada]: ${FOTO}`,
  ])("encontra a mesma identidade em Markdown: %s", (historia) => {
    expect([...fotosDaHistoria(historia)]).toEqual([FOTO]);
  });

  it("normaliza uma foto local sem confundir perfil e história", () => {
    const local = "/enviados/perfis/bbbbbbbbbbbbbbbbbbbbbbbb.webp";
    expect(identidadeDaFoto(`${local}?cache=1#foto`)).toBe(local);
    expect([...fotosDaHistoria(`![Foto](${local})`)]).toEqual([local]);
  });

  it.each([
    "/enviados/historias/../perfis/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "/enviados/historias/%2e%2e/perfis/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "/enviados/historias/%252e%252e/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "/enviados/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg\\outra",
    "https://outro-site.example/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "https://fotos.exemplo.com:444/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "https://usuario@fotos.exemplo.com/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "/enviados/historias/nome-fora-do-padrao.jpg",
  ])("recusa identidade ambígua ou não administrada: %s", (valor) => {
    expect(identidadeDaFoto(valor)).toBeNull();
  });

  it.each([
    "//outra.exemplo/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "http://antigo.exemplo/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "/fotos/historias%2Faaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "https://proxy.exemplo/?url=historias%252Faaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "https://proxy.exemplo/#historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "/enviados/historias/subpasta/../aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "//outra.exemplo/historias/%2e/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "https://outra.exemplo/historias\\aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
  ])("reconhece a chave em referência de outra origem: %s", (valor) => {
    expect(chavesDaReferencia(valor)).toContain("historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg");
    expect(chavesDaHistoria(`![Foto](${valor})`)).toContain("historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg");
  });

  it("preserva todas as chaves de uma referência", () => {
    expect(chavesDaReferencia("https://exemplo.test/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg?outra=perfis%2Fbbbbbbbbbbbbbbbbbbbbbbbb.webp"))
      .toEqual(new Set(["historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg", "perfis/bbbbbbbbbbbbbbbbbbbbbbbb.webp"]));
  });

  it("não interpreta exemplos de código como fotos usadas", () => {
    expect([...fotosDaHistoria(`\`![Exemplo](${FOTO})\``)]).toEqual([]);
  });
});
