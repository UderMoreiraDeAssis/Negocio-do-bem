import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Parâmetros e fragmentos não mudam o objeto. Caminhos ambíguos nunca são descartados. */
export function identidadeDaFoto(valor: string): string | null {
  try {
    const semSufixo = valor.split(/[?#]/, 1)[0];
    if (decodeURIComponent(semSufixo).includes("..") || semSufixo.includes("\\")) return null;
    const local = valor.startsWith("/enviados/");
    const url = new URL(valor, local ? "https://local.invalid" : undefined);
    if (url.username || url.password || url.port) return null;
    if (!local) {
      const origem = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
      if (!origem || url.protocol !== "https:" || new URL(origem).origin !== url.origin) return null;
    }
    const caminho = decodeURIComponent(url.pathname);
    const arquivo = local ? caminho.slice("/enviados/".length) : caminho.slice(1);
    if (!/^(historias|perfis)\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(arquivo)) return null;
    return local ? `/enviados/${arquivo}` : `${url.origin}/${arquivo}`;
  } catch {
    return null;
  }
}

function identidadeDaReferencia(valor: string): string | null {
  try {
    const local = valor.startsWith("/enviados/");
    const url = new URL(valor, local ? "https://local.invalid" : undefined);
    if (local) return identidadeDaFoto(url.pathname);
    // Referências duvidosas preservam a foto. Isso não autoriza administrar essa URL.
    url.username = "";
    url.password = "";
    url.port = "";
    url.search = "";
    url.hash = "";
    return identidadeDaFoto(url.href);
  } catch {
    return null;
  }
}

/** Extrai possíveis chaves sem usar a origem como prova de identidade. */
export function chavesDaReferencia(valor: string): Set<string> {
  const chaves = new Set<string>();
  let texto = valor;
  for (;;) {
    let normalizado = texto;
    try { normalizado = new URL(texto, "https://referencia.invalid").href; } catch { /* Keep the original reference. */ }
    for (const valor of [texto, normalizado]) {
      for (const resultado of valor.matchAll(/(?:historias|perfis)\/[a-f0-9]{24}\.(?:jpg|png|webp)/gi)) {
        chaves.add(resultado[0].toLowerCase());
      }
    }
    // Decode ASCII escapes even when another escape is invalid.
    const decodificado = texto.replace(/%([0-7][0-9a-f])/gi, (_, byte: string) => String.fromCharCode(parseInt(byte, 16)));
    if (decodificado === texto) break;
    texto = decodificado;
  }
  return chaves;
}

export function chavesDaHistoria(historia: string): Set<string> {
  const chaves = new Set<string>();
  type NoMarkdown = { url?: string; children?: NoMarkdown[] };
  function visitar(no: NoMarkdown) {
    if (typeof no.url === "string") {
      for (const chave of chavesDaReferencia(no.url)) chaves.add(chave);
    }
    for (const filho of no.children ?? []) visitar(filho);
  }
  Markdown({ children: historia, remarkPlugins: [remarkGfm, () => visitar] });
  return chaves;
}

/** Usa o mesmo parser da exibição, inclusive imagens por referência e links GFM. */
export function fotosDaHistoria(historia: string): Set<string> {
  const fotos = new Set<string>();
  type NoMarkdown = { type: string; url?: string; children?: NoMarkdown[] };
  function visitar(no: NoMarkdown) {
    const identidade = typeof no.url === "string" ? identidadeDaReferencia(no.url) : null;
    if (identidade) fotos.add(identidade);
    for (const filho of no.children ?? []) visitar(filho);
  }
  Markdown({ children: historia, remarkPlugins: [remarkGfm, () => visitar] });
  return fotos;
}
