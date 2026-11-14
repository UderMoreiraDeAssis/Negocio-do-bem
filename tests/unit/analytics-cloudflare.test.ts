import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("CSP sem Analytics no Cloudflare", () => {
  it.each(["production", "preview"])("preserva as fotos R2 em %s", async (ambiente) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOY_ENV", ambiente);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://fotos.example.test/pasta");
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-TEST109000");
    vi.resetModules();

    const { default: config } = await import("../../next.config");
    const regras = await config.headers!();
    const politica = regras[0].headers.find((header) => header.key === "Content-Security-Policy")!.value;
    const imagens = politica.split(";").find((diretiva) => diretiva.trim().startsWith("img-src "))!;
    expect(imagens.split(/\s+/)).toContain("https://fotos.example.test");
    expect(politica).not.toMatch(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/i);
    expect(config.outputFileTracingIncludes?.["**/*"]).toContain("./node_modules/pg-cloudflare/dist/**");
    expect(await config.redirects!()).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/indicar", destination: "/participar" }),
    ]));
  });
});
