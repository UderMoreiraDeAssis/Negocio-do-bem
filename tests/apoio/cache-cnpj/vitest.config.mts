import { defineConfig } from "vitest/config";

// Esta prova prepara a própria fixture. Não executa o setup destrutivo da suíte de banco.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/unit/cnpj.test.ts", "tests/unit/cache-cnpj-html.test.ts", "tests/unit/cache-cnpj-arquivos.test.ts", "tests/integracao/cache-cnpj.test.ts"],
  },
});
