import { afterEach, describe, expect, it } from "vitest";
import { ehModerador } from "@/lib/auth/sessao";

describe("ehModerador", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("só o papel no banco dá moderação", () => {
    expect(ehModerador({ papel: "moderador" })).toBe(true);
    expect(ehModerador({ papel: "membro" })).toBe(false);
  });

  it("o e-mail não dá moderação, nem quando está em ADMIN_EMAILS", () => {
    // O cadastro não confirma o e-mail: qualquer pessoa pode criar uma conta com ele.
    process.env.ADMIN_EMAILS = "admin@exemplo.com";
    const conta = { papel: "membro", email: "admin@exemplo.com" };
    expect(ehModerador(conta)).toBe(false);
  });
});
