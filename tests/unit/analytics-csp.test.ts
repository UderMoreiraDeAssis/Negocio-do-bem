import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("CSP da medição opcional", () => {
  it.each(["production", "preview"])("só o documento descartável permite Google em %s", async ambiente => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOY_ENV", ambiente);
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", "https://fotos.example.invalid");
    vi.resetModules();
    const { default: config } = await import("../../next.config");
    const regras = await config.headers!();
    const global = regras.find(regra => regra.source === "/:caminho*")!;
    const politica = global.headers.find(item => item.key === "Content-Security-Policy")!.value;
    expect(politica).not.toMatch(/googletagmanager|google-analytics|analytics\.google|google\.com/);
    expect(politica).toContain("https://fotos.example.invalid");
    expect(politica).toContain("frame-ancestors 'none'");
    const medicao = regras.find(regra => regra.source === "/api/analytics")!;
    expect(medicao.headers).toEqual(expect.arrayContaining([
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ]));
    const especifica = medicao.headers.find(item => item.key === "Content-Security-Policy")!.value;
    expect(especifica).toContain("https://www.googletagmanager.com");
    expect(especifica).toContain("https://*.google.com");
    expect(especifica).toContain("frame-ancestors 'self'");
    expect(especifica).toContain("default-src 'none'");
    expect(especifica).toContain("sandbox allow-scripts");
  });
});
