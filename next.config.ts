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
  `script-src 'self' 'unsafe-inline' ${SCRIPT_DO_CLOUDFLARE}${desenvolvimento ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${dominioFotos}`,
  "font-src 'self' data:",
  `connect-src 'self' ${ENVIOS_DO_CLOUDFLARE}${desenvolvimento ? " ws:" : ""}`,
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
  // Ferramentas de build e de desenvolvimento que o trace pega por engano e que
  // nunca rodam no Worker: a CLI do Prisma (compiladores de outros bancos, schema
  // engine), o PGlite do `prisma dev` e o compilador do Tailwind. Juntas, passavam
  // de 40 MiB e deixavam o Worker no limite de 64 MiB do Cloudflare (#363).
  outputFileTracingExcludes: {
    "**/*": [
      "./node_modules/prisma/**",
      "./node_modules/@prisma/dev/**",
      "./node_modules/@electric-sql/**",
      "./node_modules/@tailwindcss/**",
      "./node_modules/tailwindcss/**",
    ],
  },
  async headers() {
    return [
      { source: "/:caminho*", headers: cabecalhosDeSeguranca },
      {
        source: "/api/analytics",
        headers: [
          { key: "Content-Security-Policy", value: `default-src 'none'; script-src 'unsafe-inline' https://www.googletagmanager.com; connect-src ${ANALYTICS} ${ENVIOS_DO_GOOGLE}; img-src ${ANALYTICS} ${ENVIOS_DO_GOOGLE}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-scripts` },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
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
