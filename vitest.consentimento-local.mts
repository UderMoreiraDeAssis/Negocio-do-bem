import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/server-only.ts") } }, test: { environment: "node", include: ["tests/unit/consentimento-analytics.test.ts", "tests/unit/medicao.test.ts", "tests/unit/analytics-csp.test.ts", "tests/unit/analytics-removido.test.ts", "tests/unit/analytics-cloudflare.test.ts"] } });
