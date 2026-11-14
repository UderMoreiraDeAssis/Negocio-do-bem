import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const executar = child.execFile;
child.execFile = function (arquivo, argumentos, opcoes, callback) {
  if (!arquivo.endsWith("/node_modules/.bin/wrangler")) throw new Error("Processo inesperado");
  if (!["deployments", "versions"].includes(argumentos[0])) throw new Error("Comando Wrangler proibido");
  return executar(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "wrangler.cjs"), ...argumentos], {
    ...opcoes,
    env: { ...opcoes.env, R2_TESTE_CENARIO: process.env.R2_TESTE_CENARIO },
  }, callback);
};
syncBuiltinESMExports();
const requisitar = globalThis.fetch;
globalThis.fetch = (entrada, opcoes) => {
  const endereco = new URL(String(entrada));
  const permitidos = new Set([
    "/client/v4/accounts/conta/hyperdrive/configs/hyper-id",
    "/client/v4/accounts/conta/r2/buckets/fotos/domains/custom",
    "/client/v4/accounts/conta/r2/buckets/fotos/domains/managed",
    "/client/v4/accounts/conta/r2/buckets/fotos/objects",
    "/client/v4/accounts/conta/r2/buckets/fotos/objects/historias/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
  ]);
  if (endereco.origin !== "https://api.cloudflare.com" || !permitidos.has(endereco.pathname)) throw new Error("Endereço inesperado");
  return requisitar(`${process.env.R2_TESTE_API}${endereco.pathname}${endereco.search}`, opcoes);
};
