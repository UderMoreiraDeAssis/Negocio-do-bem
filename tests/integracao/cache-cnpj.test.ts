import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "vitest";

// A prova usa Next de produção e uma fixture Unix sintética, nunca o banco comum.
test.skipIf(process.env.TESTAR_CACHE_CNPJ !== "1")(
  "reutiliza_sucesso_em_dois_carregamentos_da_fila_e_preserva_os_limites_do_cache",
  () => {
    const resultado = spawnSync(process.execPath, [
      "--max-old-space-size=4096", "--import", "tsx",
      path.resolve("tests/apoio/cache-cnpj/prova.mjs"),
    ], { stdio: "inherit", env: process.env });
    expect(resultado.error).toBeUndefined();
    expect(resultado.status).toBe(0);
  },
  300_000,
);
