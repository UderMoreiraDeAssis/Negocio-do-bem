/** Executa tudo por padrão. O campo cenario permite provas isoladas com a mesma observação HTTP. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as criarTcp } from "node:net";
import { resolve } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { atributo, decodificar, formularioDeEntrada, observarFila, sanitizarHtml } from "./html.mjs";
import { artefatos } from "./arquivos.mjs";

assert.equal(realpathSync(process.env.CACHE_CNPJ_PROVA), "/fixture/config.json");
const config = JSON.parse(readFileSync(process.env.CACHE_CNPJ_PROVA, "utf8"));
const cenario = config.cenario ?? "completo";
assert(["completo", "carregamentos", "equivalentes", "alfanumerico", "reinicio"].includes(cenario), "Cenário de prova desconhecido");
const raiz = realpathSync(process.cwd());
const destino = realpathSync(config.evidencias);
assert.equal(raiz, "/fixture/source");
assert.equal(destino, "/fixture/evidence");
assert.equal(realpathSync(config.fixture), "/fixture/fixture.json");
const fixture = JSON.parse(readFileSync(config.fixture, "utf8"));
assert.equal(fixture.synthetic, true);
assert.equal(fixture.production, false);
assert.match(fixture.container, /^ndb-[a-z0-9]+-cache-[a-z0-9-]+$/);
assert.equal(fixture.networkMode, "none");
assert.equal(fixture.socketDirectory, "/fixture/pg");
assert.equal(realpathSync(fixture.socketDirectory), "/fixture/pg");
assert(lstatSync("/fixture/pg/.s.PGSQL.5432").isSocket());
assert.equal(fixture.database, "negocio_do_bem_teste");
assert.equal(fixture.user, "postgres");
assert.equal(fixture.port, 5432);
assert(!readdirSync(raiz).some(n => n === ".env" || n.startsWith(".env.")));
assert(existsSync(resolve(raiz, ".next/BUILD_ID")));
const url = new URL(`postgresql://localhost:5432/${fixture.database}`);
url.username = fixture.user;
url.searchParams.set("host", fixture.socketDirectory);
url.searchParams.set("schema", "public");
const { PrismaPg } = await import(pathToFileURL(resolve(raiz, "node_modules/@prisma/adapter-pg/dist/index.js")));
const { PrismaClient } = await import(pathToFileURL(resolve(raiz, "src/generated/prisma/client.ts")));
const { gerarHashSenha } = await import(pathToFileURL(resolve(raiz, "src/lib/auth/senha.ts")));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
const cache = resolve(raiz, ".next/cache/fetch-cache");
const fila = "/moderacao?aba=reivindicacoes";
const chamadas = [];
const respostas = new Map();
const pedidos = [];
const registros = [];
let servidor;
let api;
let origem;
let cookie;
let log = "";
let moderador;
let empresa;
let anteriores = [];
let codigo = 2;
const identidade = randomUUID().replaceAll("-", "");
const salvar = (nome, valor) => writeFileSync(resolve(destino, nome), JSON.stringify(valor, null, 2) + "\n");
function registrar(nome, valor) {
  registros.push({ nome, ...valor });
  salvar("observacoes.json", registros);
  console.log(`[PROVA37] ${nome} ${JSON.stringify(valor)}`);
}
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function aguardar(condicao, nome, limite = 15_000) {
  const fim = Date.now() + limite;
  do {
    if (await condicao()) return;
    await esperar(50);
  } while (Date.now() < fim);
  assert.fail(`Condição não observada: ${nome}`);
}
async function escutar(s) {
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  return s.address().port;
}
async function ler(caminho = fila, autenticado = true) {
  const r = await fetch(`${origem}${caminho}`, { headers: autenticado && cookie ? { cookie } : {}, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  return { status: r.status, html: await r.text() };
}
function contar(cnpj) { return chamadas.filter(c => c.cnpj === cnpj).length; }
function publico(marcador) {
  return { razaoSocial: marcador, nomeFantasia: "Nome fictício", situacao: "ATIVA", municipio: "Recife", uf: "PE", socios: [], telefone: null, email: null };
}
function respostaBoa(marcador) { return { tipo: "sucesso", marcador }; }
function atender(res, estado) {
  if (estado.tipo === "rede") { res.destroy(); return; }
  if (estado.tipo === "timeout") return;
  res.writeHead(estado.status ?? 200, { "Content-Type": "application/json" });
  if (estado.tipo === "json") res.end("{inválido");
  else res.end(JSON.stringify({ razao_social: estado.marcador, nome_fantasia: "Nome fictício", descricao_situacao_cadastral: "ATIVA", municipio: "Recife", uf: "PE", socios: "NÃO PERSISTIR" }));
}
async function iniciar() {
  const reserva = criarTcp();
  const porta = await escutar(reserva);
  await new Promise(ok => reserva.close(ok));
  origem = `http://127.0.0.1:${porta}`;
  const transporte = resolve(destino, "transporte.json");
  salvar("transporte.json", { origin: `http://127.0.0.1:${api.address().port}`, databaseSocket: `${fixture.socketDirectory}/.s.PGSQL.5432` });
  const preload = resolve(raiz, "tests/apoio/cache-cnpj/transporte.mjs");
  servidor = spawn(process.execPath, ["--max-old-space-size=4096", resolve(raiz, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(porta)], {
    cwd: raiz, detached: true, stdio: ["ignore", "pipe", "pipe"], env: {
      PATH: "/usr/bin:/bin", HOME: destino, TMPDIR: destino, NODE_ENV: "production", DATABASE_URL: url.href,
      APP_URL: origem, NEXT_TELEMETRY_DISABLED: "1", CIRCLE_NODE_TOTAL: "2", RAYON_NUM_THREADS: "2", UV_THREADPOOL_SIZE: "2",
      NODE_OPTIONS: `--max-old-space-size=4096 --import=${preload}`, CACHE_CNPJ_TRANSPORTE: transporte,
    },
  });
  servidor.stdout.on("data", b => { log += b; });
  servidor.stderr.on("data", b => { log += b; });
  servidor.on("error", () => { log += "PROVA37_ERRO_INICIAR"; });
  await aguardar(async () => {
    assert.equal(servidor.exitCode, null);
    try { const r = await ler("/entrar", false); return r.status === 200 && r.html.includes('name="senha"'); }
    catch { return false; }
  }, "prontidão Next", 60_000);
  registrar("iniciar", { pid: servidor.pid, buildId: readFileSync(resolve(raiz, ".next/BUILD_ID"), "utf8"), porta });
}
async function parar() {
  if (!servidor) return;
  const pid = servidor.pid;
  if (servidor.exitCode === null && servidor.signalCode === null) {
    const fim = once(servidor, "close");
    process.kill(-pid, "SIGTERM");
    await fim;
  }
  const porta = new URL(origem).port;
  await assert.rejects(fetch(`${origem}/entrar`, { signal: AbortSignal.timeout(1000) }));
  registrar("parar", { pid, porta, codigo: servidor.exitCode, sinal: servidor.signalCode, portaFechada: true });
  servidor = undefined;
}
async function autenticar(senha, email) {
  const pagina = `${origem}/entrar?voltar=${encodeURIComponent(fila)}`;
  const entrada = await ler(`/entrar?voltar=${encodeURIComponent(fila)}`);
  const formulario = formularioDeEntrada(entrada.html, pagina);
  formulario.dados.set("email", email);
  formulario.dados.set("senha", senha);
  formulario.dados.set("voltar", fila);
  const antes = await db.sessao.count({ where: { usuarioId: moderador.id } });
  const r = await fetch(formulario.destino, { method: "POST", headers: { origin: origem }, body: formulario.dados, redirect: "manual" });
  await r.text();
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), fila);
  const cookies = r.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => /^ndb_sessao=[A-Za-z0-9_-]+$/.test(c));
  assert.equal(cookies.length, 1);
  cookie = cookies[0];
  assert.equal(await db.sessao.count({ where: { usuarioId: moderador.id } }), antes + 1);
  registrar("login-real", { status: r.status, sessoesCriadasPelaAplicacao: 1 });
}
async function preparar(valores) {
  await db.reivindicacao.updateMany({ where: { id: { in: pedidos } }, data: { status: "cancelada" } });
  const atuais = [];
  for (const cnpj of valores) {
    const p = await db.reivindicacao.create({ data: { usuarioId: moderador.id, empresaId: empresa.id, metodo: "documento", cnpj,
      relacao: "Responsável sintético", contato: "contato@exemplo.test", expiraEm: new Date(Date.now() + 86_400_000) } });
    pedidos.push(p.id);
    atuais.push(p);
  }
  return atuais;
}
function conferir(html, atuais, marcador) {
  salvar("ultima-fila.html", sanitizarHtml(html));
  const observados = atuais.map(p => ({ pedido: p.id, ...observarFila(html, empresa.nome, p.id, marcador) }));
  registrar("dados-por-ficha", { cenario, fichas: observados });
  for (const o of observados) {
    assert(o.ficha && o.controles && o.marcadorRenderizado, "Ficha, controles e dado público devem aparecer no HTML do mesmo pedido");
  }
  assert(!/HARNESS37_(?:FETCH_EXTERNO_BLOQUEADO|TRANSPORTE_INVALIDO|SOCKET_EXTERNO_BLOQUEADO)|PROVA37_ERRO_INICIAR/.test(log));
  return observados;
}
function arquivosCache() {
  if (!existsSync(cache)) return [];
  return readdirSync(cache).map(n => resolve(cache, n));
}
function entrada(marcador) {
  const encontrados = arquivosCache().filter(p => {
    assert(!lstatSync(p).isSymbolicLink());
    assert(realpathSync(p).startsWith(`${realpathSync(cache)}/`));
    try {
      const e = JSON.parse(readFileSync(p, "utf8"));
      return e.kind === "FETCH" && JSON.parse(e.data.body).razaoSocial === marcador;
    } catch { return false; }
  });
  if (!encontrados.length) return undefined;
  assert.equal(encontrados.length, 1);
  const caminho = encontrados[0];
  const bytes = readFileSync(caminho);
  const e = JSON.parse(bytes);
  assert.equal(e.revalidate, 86400);
  assert.deepEqual(JSON.parse(e.data.body), publico(marcador));
  return { caminho, hash: hash(bytes), tamanho: bytes.length, mtime: statSync(caminho).mtimeMs, revalidate: e.revalidate };
}
async function persistido(marcador) {
  let resultado;
  await aguardar(() => { resultado = entrada(marcador); return !!resultado; }, "escrita FETCH íntegra");
  return resultado;
}
let proximo = 1;
function cnpjNovo() {
  let base = `37990000${String(proximo++).padStart(4, "0")}`;
  for (const pesos of [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
    const resto = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    base += resto < 2 ? 0 : 11 - resto;
  }
  return base;
}
async function provarCarregamentos() {
  const cnpj = "11222333000181";
  const marcador = `RECEITA37A${identidade}`;
  respostas.set(cnpj, respostaBoa(marcador));
  const atuais = await preparar(["11.222.333/0001-81"]);
  for (let n = 1; n <= 2; n++) {
    const r = await ler();
    assert.equal(r.status, 200);
    const fichas = conferir(r.html, atuais, marcador);
    writeFileSync(resolve(destino, `fila-${n}.html`), sanitizarHtml(r.html));
    registrar(`get-${n}`, { chamadas: contar(cnpj), fichas, marcadorRenderizado: true, controles: true });
  }
  salvar("comparacao.json", { cenario: "carregamentos", esperado: 1, observado: contar(cnpj), getsAutenticados: 2, conteudoConferido: true });
  assert.equal(contar(cnpj), 1, "[COMPORTAMENTO37] dois carregamentos devem reutilizar o CNPJ normalizado");
  registrar("reutiliza_sucesso_em_dois_carregamentos_da_fila", { chamadas: 1 });
  return atuais;
}

async function provarAlfanumerico() {
  const cnpj = "12ABC34501DE35";
  const marcador = `ALFA37${identidade}`;
  respostas.set(cnpj, respostaBoa(marcador));
  const atuais = await preparar(["12.ABC.345/01DE-35", "12abc34501de35", cnpj]);
  let fichas;
  for (let n = 1; n <= 2; n++) {
    const resposta = await ler();
    assert.equal(resposta.status, 200);
    fichas = conferir(resposta.html, atuais, marcador);
    registrar(`alfanumerico-get-${n}`, { status: resposta.status, chamadas: contar(cnpj), fichas });
  }
  salvar("comparacao.json", { cenario: "alfanumerico", esperado: 1, observado: contar(cnpj), getsAutenticados: 2, fichas });
  assert.equal(contar(cnpj), 1, "[COMPORTAMENTO37] fichas alfanuméricas devem compartilhar a consulta normalizada");
  registrar("normaliza_cnpj_alfanumerico_antes_do_cache", { fichas: fichas.filter(f => f.marcadorRenderizado).length, gets: 2, chamadas: 1 });
  return atuais;
}

async function provarEquivalentes() {
  const cnpj = cnpjNovo();
  const marcador = `NUM37${identidade}`;
  respostas.set(cnpj, respostaBoa(marcador));
  const formatado = `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`;
  const atuais = await preparar([formatado, cnpj]);
  const resposta = await ler();
  assert.equal(resposta.status, 200);
  const fichas = conferir(resposta.html, atuais, marcador);
  registrar("equivalentes-get", { status: resposta.status, chamadas: contar(cnpj), fichas });
  salvar("comparacao.json", { cenario: "equivalentes", esperado: 1, observado: contar(cnpj), getsAutenticados: 1, fichas });
  assert.equal(contar(cnpj), 1, "[COMPORTAMENTO37] fichas equivalentes frias devem compartilhar a consulta");
  registrar("compartilha_fichas_equivalentes_na_consulta_fria", { fichas: fichas.filter(f => f.marcadorRenderizado).length, chamadas: 1, chaveDistintaDaAlfanumerica: true });
  return atuais;
}

async function provarReinicio() {
  const cnpj = cnpjNovo();
  const marcador = `REINICIO37${identidade}`;
  respostas.set(cnpj, respostaBoa(marcador));
  const atuais = await preparar([cnpj]);
  const hashes = artefatos(raiz);
  const primeiro = await ler();
  assert.equal(primeiro.status, 200);
  const primeiraFicha = conferir(primeiro.html, atuais, marcador);
  assert.equal(contar(cnpj), 1);
  const inicioPersistencia = Date.now();
  let entradaAntes;
  do {
    entradaAntes = entrada(marcador);
    if (entradaAntes) break;
    await esperar(50);
  } while (Date.now() - inicioPersistencia < 15_000);
  registrar("persistencia-antes-do-reinicio", { entradaEncontrada: !!entradaAntes });
  const buildAntes = readFileSync(resolve(raiz, ".next/BUILD_ID"), "utf8");
  await parar();
  await iniciar();
  const segundo = await ler();
  assert.equal(segundo.status, 200);
  const segundaFicha = conferir(segundo.html, atuais, marcador);
  assert.deepEqual(artefatos(raiz), hashes);
  assert.equal(readFileSync(resolve(raiz, ".next/BUILD_ID"), "utf8"), buildAntes);
  salvar("comparacao.json", { cenario: "reinicio", esperado: 1, observado: contar(cnpj), getsAutenticados: 2, statusPrimeiro: primeiro.status, statusSegundo: segundo.status, reinicioReal: true, mesmoBuild: true, entradaAntesDoReinicio: !!entradaAntes, primeiraFicha, segundaFicha });
  assert.equal(contar(cnpj), 1, "[COMPORTAMENTO37] o segundo processo deve reutilizar a consulta persistida");
  assert(entradaAntes, "A escrita persistente deve terminar antes de encerrar o primeiro processo");
  const persistencia = await persistido(marcador);
  registrar("reutiliza_sucesso_apos_reiniciar_o_next", { chamadas: 1, reinicioReal: true, mesmoBuild: true, entrada: persistencia });
  return atuais;
}

try {
  const [banco] = await db.$queryRaw`SELECT current_database() AS banco, host(inet_server_addr()) AS host`;
  assert.equal(banco.banco, fixture.database);
  assert.equal(banco.host, null);
  assert.equal(arquivosCache().length, 0, "O armazenamento deve começar frio");
  anteriores = await db.reivindicacao.findMany({ where: { status: "pendente" }, select: { id: true } });
  await db.reivindicacao.updateMany({ where: { id: { in: anteriores.map(p => p.id) } }, data: { status: "cancelada" } });
  const senha = randomUUID();
  moderador = await db.usuario.create({ data: { nome: "Moderação sintética", email: `cache37-${identidade}@exemplo.test`, papel: "moderador", senhaHash: await gerarHashSenha(senha) } });
  empresa = await db.empresa.create({ data: { instagramUsername: `cache37.${identidade}`, nome: `EMPRESA37${identidade}`, resumo: "Prova sintética", categoria: "outros", cidade: "Recife", uf: "PE", moderacao: "aprovada" } });
  api = createServer((req, res) => {
    const cnpj = req.url?.split("/").at(-1);
    const valido = req.method === "GET" && req.url === `/api/cnpj/v1/${cnpj}` && /^[0-9A-Z]{14}$/.test(cnpj ?? "") &&
      req.headers["user-agent"] === "NegocioDoBem/1.0 (+https://github.com/fabs-reis/Negocio-do-bem)";
    chamadas.push({ cnpj, valido });
    salvar("chamadas.json", chamadas);
    const estado = respostas.get(cnpj);
    if (!valido || !estado) { res.writeHead(500); res.end(); return; }
    if (estado.pendente) { estado.liberar = () => atender(res, estado); return; }
    atender(res, estado);
  });
  await escutar(api);
  await iniciar();
  await autenticar(senha, moderador.email);
  if (cenario !== "completo") {
    const isolados = { carregamentos: provarCarregamentos, equivalentes: provarEquivalentes, alfanumerico: provarAlfanumerico, reinicio: provarReinicio };
    await isolados[cenario]();
  } else {
    await provarCarregamentos();
    await provarAlfanumerico();
    let atuais = await provarEquivalentes();

    for (const falha of [403, 404, 429, 500, "json", "rede", "timeout"]) {
      const cnpj = cnpjNovo();
      const marca = `RECUPERA37${falha}${identidade}`;
      atuais = await preparar([cnpj]);
      respostas.set(cnpj, typeof falha === "number" ? { tipo: "http", status: falha } : { tipo: falha });
      const arquivosAntes = arquivosCache().sort();
      const inicio = Date.now();
      const r = await ler();
      const esperaMs = Date.now() - inicio;
      assert(r.html.includes("Não foi possível consultar a Receita agora."));
      assert(observarFila(r.html, empresa.nome, atuais[0].id, "ausente").controles);
      assert.equal(contar(cnpj), 1);
      assert.deepEqual(arquivosCache().sort(), arquivosAntes, "Falha fria não pode produzir entrada diária");
      if (falha === "timeout") assert(esperaMs >= 4900, "O timeout deve alcançar o limite real de cinco segundos");
      respostas.set(cnpj, respostaBoa(marca));
      for (let n = 0; n < 2; n++) conferir((await ler()).html, atuais, marca);
      assert.equal(contar(cnpj), 2);
      registrar(`falha-fria-${falha}`, { aviso: true, controles: true, recuperou: true, chamadas: 2, esperaMs, entradasNaFalha: 0 });
    }

    const streamCnpj = cnpjNovo();
    const streamMarca = `STREAM37${identidade}`;
    atuais = await preparar([streamCnpj]);
    const pendente = { ...respostaBoa(streamMarca), pendente: true };
    respostas.set(streamCnpj, pendente);
    const streaming = await fetch(`${origem}${fila}`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) });
    const leitor = streaming.body.getReader();
    let parcial = "";
    while (!parcial.includes("Consultando a Receita") || !parcial.includes('name="motivo"')) {
      const parte = await leitor.read();
      assert(!parte.done);
      parcial += new TextDecoder().decode(parte.value);
    }
    assert(!parcial.includes(streamMarca));
    await aguardar(() => !!pendente.liberar, "consulta pendente");
    registrar("streaming", { fallbackAntesDoDado: true, controlesAntesDoDado: true });
    pendente.liberar();
    for (;;) { const p = await leitor.read(); if (p.done) break; parcial += new TextDecoder().decode(p.value); }
    conferir(parcial, atuais, streamMarca);

    const hashes = artefatos(raiz);
    salvar("build-sha256.json", hashes);
    for (const falha of ["sucesso", "http", "json", "rede", "timeout"]) {
      const cnpj = cnpjNovo();
      const a = `TEMPO37A${falha}${identidade}`;
      const b = `TEMPO37B${falha}${identidade}`;
      atuais = await preparar([cnpj]);
      respostas.set(cnpj, respostaBoa(a));
      conferir((await ler()).html, atuais, a);
      const entradaA = await persistido(a);
      assert.equal(contar(cnpj), 1);
      await parar();
      assert.deepEqual(entrada(a), entradaA);
      respostas.set(cnpj, respostaBoa(b));
      await iniciar();
      conferir((await ler()).html, atuais, a);
      assert.equal(contar(cnpj), 1);
      registrar(`reinicio-fresco-${falha}`, { chamadas: 1, entrada: entradaA });
      await parar();
      const antes = new Map(arquivosCache().map(p => [p, { hash: hash(readFileSync(p)), mtime: statSync(p).mtimeMs }]));
      const st = statSync(entradaA.caminho);
      utimesSync(entradaA.caminho, st.atime, new Date(st.mtimeMs - 86_460_000));
      const velha = entrada(a);
      assert.equal(velha.hash, entradaA.hash);
      assert.equal(velha.tamanho, entradaA.tamanho);
      assert(Math.abs(velha.mtime - (entradaA.mtime - 86_460_000)) < 2);
      assert(Date.now() - velha.mtime > 86_400_000);
      for (const [p, dados] of antes) {
        assert.equal(hash(readFileSync(p)), dados.hash);
        if (p !== entradaA.caminho) assert.equal(statSync(p).mtimeMs, dados.mtime);
      }
      assert.deepEqual(artefatos(raiz), hashes);
      const estado = { tipo: falha, status: falha === "http" ? 500 : undefined, marcador: b, pendente: true };
      respostas.set(cnpj, estado);
      await iniciar();
      const inicioLog = log.length;
      const stale = await ler();
      conferir(stale.html, atuais, a);
      await aguardar(() => !!estado.liberar, "revalidação iniciada");
      assert.equal(contar(cnpj), 2);
      estado.liberar();
      if (falha !== "sucesso") {
        await aguardar(() => log.slice(inicioLog).split("\n").some(l => l.includes("revalidating cache with key:") && l.includes(cnpj)), "rejeição nativa da revalidação", 15_000);
        assert.deepEqual(entrada(a), velha);
        registrar(`revalidacao-rejeitada-${falha}`, { chamadas: 2, preservou: velha, rejeicaoNativaDaChave: true });
        respostas.set(cnpj, respostaBoa(b));
        conferir((await ler()).html, atuais, a);
      }
      const nova = await persistido(b);
      assert.equal(nova.caminho, velha.caminho);
      assert(nova.mtime > velha.mtime + 86_400_000);
      conferir((await ler()).html, atuais, b);
      assert.equal(contar(cnpj), falha === "sucesso" ? 2 : 3);
      assert.deepEqual(artefatos(raiz), hashes);
      registrar(`revalidacao-${falha}`, { chamadas: contar(cnpj), mesmaChave: true, ttl: 86400, buildInalterado: true, entrada: nova });
    }

    const ultimo = atuais[0];
    const novasNotas = `BANCO37${identidade}`;
    await db.reivindicacao.update({ where: { id: ultimo.id }, data: { notas: novasNotas } });
    const antesBanco = chamadas.length;
    const r = await ler();
    assert(sanitizarHtml(r.html).includes(novasNotas));
    assert.equal(chamadas.length, antesBanco);
    registrar("banco-atualizado", { notasNovasRenderizadas: true, novasConsultasPublicas: 0 });
    const forms = [...r.html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
    const form = forms.find(m => m[2].includes('name="motivo"') && m[2].includes(`value="${ultimo.id}"`));
    assert(form);
    const dados = new FormData();
    for (const m of form[2].matchAll(/<input\b[^>]*>/gi)) {
      const nome = atributo(m[0], "name");
      if (nome) dados.append(nome, atributo(m[0], "value") ?? "");
    }
    dados.set("motivo", "Recusa sintética que deve ser negada");
    const antesPermissao = { pedido: await db.reivindicacao.findUnique({ where: { id: ultimo.id } }), auditoria: await db.registroAuditoria.count(), membros: await db.empresaMembro.count() };
    await db.usuario.update({ where: { id: moderador.id }, data: { papel: "membro" } });
    const negado = await ler();
    const visivel = decodificar(sanitizarHtml(negado.html));
    assert(!visivel.includes(empresa.nome) && !visivel.includes(novasNotas) && !visivel.includes('name="motivo"') && !visivel.includes(`value="${ultimo.id}"`));
    assert(!visivel.includes(`TEMPO37Btimeout${identidade}`));
    const decisao = await fetch(new URL(atributo(form[1], "action") || fila, origem), { method: "POST", headers: { cookie, origin: origem }, body: dados, redirect: "manual" });
    const htmlDecisao = sanitizarHtml(await decisao.text());
    assert(!htmlDecisao.includes(empresa.nome) && !htmlDecisao.includes('name="motivo"'));
    assert.deepEqual({ pedido: await db.reivindicacao.findUnique({ where: { id: ultimo.id } }), auditoria: await db.registroAuditoria.count(), membros: await db.empresaMembro.count() }, antesPermissao);
    assert.equal(chamadas.length, antesBanco);
    registrar("autorizacao-revogada", { mesmaSessao: true, conteudoNegado: true, formularioAnteriorNegado: true, mutacoes: 0, statusGet: negado.status, statusPost: decisao.status });
  }
  assert(chamadas.every(c => c.valido));
  codigo = 0;
} catch (erro) {
  const mensagem = /^\[HARNESS37\] [a-z0-9-]+$/.test(erro?.message ?? "") ? erro.message : "Falha do harness. Consulte a etapa registrada.";
  const falha = erro instanceof assert.AssertionError ? { nome: erro.name, mensagem: erro.message, esperado: erro.expected, observado: erro.actual } : { nome: erro?.name ?? "unknown", mensagem };
  salvar("falha.json", falha);
  console.error(JSON.stringify(falha));
  codigo = erro instanceof assert.AssertionError ? 1 : 2;
} finally {
  await parar();
  if (api?.listening) { api.closeAllConnections(); await new Promise(ok => api.close(ok)); }
  if (moderador) {
    await db.usuario.update({ where: { id: moderador.id }, data: { papel: "membro" } });
    await db.reivindicacao.updateMany({ where: { id: { in: pedidos } }, data: { status: "cancelada" } });
  }
  await db.reivindicacao.updateMany({ where: { id: { in: anteriores.map(p => p.id) } }, data: { status: "pendente" } });
  await db.$disconnect();
  writeFileSync(resolve(destino, "next.log"), log.replace(/ndb_sessao=[^;\s]+/g, "ndb_sessao=[omitido]"));
  registrar("encerramento", { servidorParado: !servidor, respondedorParado: !api?.listening, clienteBancoFechado: true, codigo });
}
process.exitCode = codigo;
