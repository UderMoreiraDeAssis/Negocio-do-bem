import { readFileSync } from "node:fs";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
const config = JSON.parse(readFileSync(process.env.CACHE_CNPJ_TRANSPORTE, "utf8"));
const origemLocal = new URL(config.origin);
if (origemLocal.protocol !== "http:" || origemLocal.hostname !== "127.0.0.1" ||
    origemLocal.username || origemLocal.password || origemLocal.pathname !== "/" ||
    origemLocal.search || origemLocal.hash || config.databaseSocket !== "/fixture/pg/.s.PGSQL.5432") {
  throw new Error("[HARNESS37] configuração de transporte inválida");
}
function verificarConexao(args) {
  const [opcoes] = net._normalizeArgs(args);
  const host = opcoes.host ?? "localhost";
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (opcoes.path === config.databaseSocket) process.stderr.write("[HARNESS37_UNIX_DATABASE_TRANSPORT]\n");
  const unixLocal = opcoes.path === config.databaseSocket;
  if (opcoes.path ? !unixLocal : !local) {
    process.stderr.write("[HARNESS37_SOCKET_EXTERNO_BLOQUEADO]\n");
    throw new Error("[HARNESS37] socket externo bloqueado");
  }
}
const conectar = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  verificarConexao(args);
  return conectar.apply(this, args);
};
const criarConexao = net.connect;
net.connect = net.createConnection = function (...args) {
  verificarConexao(args);
  return criarConexao.apply(this, args);
};
syncBuiltinESMExports();
const fetchNativo = globalThis.fetch.bind(globalThis);
globalThis.fetch = async function transportar(input, init) {
  const pedido = new Request(input, init);
  const url = new URL(pedido.url);
  if (url.origin === "https://brasilapi.com.br") {
    if (pedido.method !== "GET" || !/^\/api\/cnpj\/v1\/[0-9A-Z]{14}$/.test(url.pathname) || url.search) {
      process.stderr.write("[HARNESS37_TRANSPORTE_INVALIDO]\n");
      throw new Error("[HARNESS37] pedido BrasilAPI fora do contrato");
    }
    return fetchNativo(new Request(new URL(url.pathname, origemLocal), pedido));
  }
  if (url.protocol === "http:" && url.hostname === "127.0.0.1") return fetchNativo(pedido);
  process.stderr.write("[HARNESS37_FETCH_EXTERNO_BLOQUEADO]\n");
  throw new Error("[HARNESS37] fetch externo bloqueado");
};
process.stderr.write("[HARNESS37_TRANSPORTE_ATIVO]\n");
