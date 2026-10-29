import type { MetadataRoute } from "next";
import { INDEXAVEL, urlAbsoluta } from "@/lib/seo";

// Todos os robôs podem ler o site, inclusive os de busca com IA (OAI-SearchBot
// e GPTBot do ChatGPT, PerplexityBot, ClaudeBot). Ficam de fora só as áreas de
// quem está logado. Login, cadastro e reivindicação continuam abertos para o
// robô ler o noindex dessas páginas; bloqueadas aqui, poderiam aparecer na
// busca só com o endereço.
export default function robots(): MetadataRoute.Robots {
  if (!INDEXAVEL) {
    // Previews do Vercel: nada entra no índice, para não competir com a produção.
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/moderacao", "/api/"] },
    sitemap: urlAbsoluta("/sitemap.xml"),
  };
}
