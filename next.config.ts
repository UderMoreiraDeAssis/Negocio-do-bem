import type { NextConfig } from "next";

const desenvolvimento = process.env.NODE_ENV === "development";
const ANALYTICS = "https://*.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com";
// O GA4 também manda envios para www.google.com/g/collect. O guia de CSP do Google pede *.google.com
// no connect-src mesmo sem os recursos de anúncios.
const ENVIOS_DO_GOOGLE = "https://*.google.com";
// O Cloudflare injeta nas páginas o script do Web Analytics, que manda os dados para cloudflareinsights.com.
const SCRIPT_DO_CLOUDFLARE = "https://static.cloudflareinsights.com";
const ENVIOS_DO_CLOUDFLARE = "https://cloudflareinsights.com";
const dominioFotos = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ? ` ${new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL).origin}` : "";

const politicaDeConteudo = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://*.googletagmanager.com ${SCRIPT_DO_CLOUDFLARE}${desenvolvimento ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${dominioFotos} ${ANALYTICS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${ANALYTICS} ${ENVIOS_DO_GOOGLE} ${ENVIOS_DO_CLOUDFLARE}${desenvolvimento ? " ws:" : ""}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(desenvolvimento ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const cabecalhosDeSeguranca = [
  { key: "Content-Security-Policy", value: politicaDeConteudo },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // pg carrega pg-cloudflare por require dinâmico; inclua a implementação
  // Workerd no trace do Next para o bundle OpenNext poder resolvê-la.
  outputFileTracingIncludes: {
    "**/*": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/esm/**"],
  },
  async headers() {
    return [{ source: "/:caminho*", headers: cabecalhosDeSeguranca }];
  },
  async redirects() {
    return [
      // O cadastro tem uma entrada só (/participar). A busca vai junto: ?instagram=<@>&dono=sim.
      { source: "/indicar", destination: "/participar", permanent: false },
      // O diretório ficava na página inicial: links antigos com filtro abrem o /explorar, com a mesma busca.
      ...["q", "causa", "uf", "pagina"].map((chave) => ({
        source: "/",
        has: [{ type: "query" as const, key: chave }],
        destination: "/explorar",
        permanent: false,
      })),
    ];
  },
  /* config options here */
  cacheComponents: true,
  experimental: {
    // Fotos chegam reduzidas pelo navegador, mas o padrão de 1 MB é apertado.
    // O documento da verificação (#293) leva até 2 arquivos de 5 MB; cada ação confere o
    // tamanho dos seus arquivos de novo.
    serverActions: { bodySizeLimit: "11mb" },
    // Sem conexão, navegações e Server Actions esperam a internet voltar em
    // vez de dar erro; o AvisoSemConexao avisa enquanto isso.
    useOffline: true,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
