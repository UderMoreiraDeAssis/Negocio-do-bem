import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { artefatos } from "../apoio/cache-cnpj/arquivos.mjs";

const criados: string[] = [];
afterEach(() => {
  for (const caminho of criados.splice(0)) rmSync(caminho, { recursive: true });
});

function fixture() {
  const raiz = mkdtempSync(resolve(tmpdir(), "cache-cnpj-artefatos-"));
  criados.push(raiz);
  mkdirSync(resolve(raiz, ".next/server"), { recursive: true });
  mkdirSync(resolve(raiz, ".next/static"));
  writeFileSync(resolve(raiz, ".next/BUILD_ID"), "build-sintetico");
  writeFileSync(resolve(raiz, ".next/server/pagina.js"), "codigo-sintetico");
  writeFileSync(resolve(raiz, ".next/static/pagina.css"), "estilo-sintetico");
  return raiz;
}

it("não confunde promoção do cache de rota em runtime com alteração do build", () => {
  const raiz = fixture();
  const antes = artefatos(raiz);
  const cache = resolve(raiz, ".next/server/route-cache/APP_PAGE/namespace");
  mkdirSync(cache, { recursive: true });
  writeFileSync(resolve(cache, "pagina.html"), "cache-sintetico");
  expect(artefatos(raiz)).toEqual(antes);
});

it.each([".next/BUILD_ID", ".next/server/pagina.js", ".next/static/pagina.css"])(
  "continua detectando mudança do artefato imutável %s",
  caminho => {
    const raiz = fixture();
    const antes = artefatos(raiz);
    writeFileSync(resolve(raiz, caminho), "conteudo-alterado");
    expect(artefatos(raiz)).not.toEqual(antes);
  },
);

it("bloqueia conexões fora da fixture em cada API de socket", () => {
  const raiz = fixture();
  const config = resolve(raiz, "transporte.json");
  writeFileSync(config, JSON.stringify({ origin: "http://127.0.0.1:1234", databaseSocket: "/fixture/pg/.s.PGSQL.5432" }));
  const codigo = `
    import net from "node:net";
    import assert from "node:assert/strict";
    for (const conectar of [net.connect, net.createConnection, (...args) => new net.Socket().connect(...args)]) {
      assert.throws(() => conectar({ path: "/fixture/pg/outro" }), /socket externo bloqueado/);
      assert.throws(() => conectar({ host: "192.0.2.1", port: 5432 }), /socket externo bloqueado/);
    }
  `;
  const resultado = spawnSync(process.execPath, ["--import", resolve("tests/apoio/cache-cnpj/transporte.mjs"), "--input-type=module", "-e", codigo], {
    env: { NODE_ENV: "test", CACHE_CNPJ_TRANSPORTE: config }, encoding: "utf8",
  });
  expect(resultado.error).toBeUndefined();
  expect(resultado.status, resultado.stderr).toBe(0);
});
