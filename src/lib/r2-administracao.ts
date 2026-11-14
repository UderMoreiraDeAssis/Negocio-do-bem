import { execFile } from "node:child_process";
import path from "node:path";
import { identidadeDaFoto } from "@/lib/fotos-historias";

type Registro = Record<string, unknown>;
type Inventario = { objetos: Map<string, string>; excluir: (url: string) => Promise<void> };

function registro(valor: unknown): Registro {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error("Metadados R2 incompletos.");
  return valor as Registro;
}

function texto(valor: unknown): string {
  if (typeof valor !== "string" || !valor) throw new Error("Metadados R2 incompletos.");
  return valor;
}

function lista(valor: unknown): unknown[] {
  if (!Array.isArray(valor)) throw new Error("Metadados R2 incompletos.");
  return valor;
}

function origemPublica(valor: string): string {
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new Error("A origem pública R2 é inválida.");
  }
}

/** Prepara o inventário e só autoriza o descarte após conferir a associação nativa. */
export async function prepararInventarioHistoriasR2(aplicar: boolean, aposentadas: readonly string[] = []): Promise<Inventario> {
  const conta = texto(process.env.CLOUDFLARE_ACCOUNT_ID);
  const token = texto(process.env.CLOUDFLARE_API_TOKEN);
  const bucket = texto(process.env.FOTOS_R2_BUCKET);
  const origem = origemPublica(texto(process.env.NEXT_PUBLIC_R2_PUBLIC_URL));
  if (!["production", "preview"].includes(texto(process.env.DEPLOY_ENV))) throw new Error("Informe o ambiente da implantação.");
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(bucket)) throw new Error("O bucket R2 é inválido.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(conta)}`;
  const caminhoBucket = `${base}/r2/buckets/${encodeURIComponent(bucket)}`;

  async function consultar(endereco: string): Promise<Registro> {
    try {
      const resposta = await fetch(endereco, { headers: { Authorization: `Bearer ${token}` }, redirect: "error" });
      if (!resposta.ok) throw new Error();
      if (!resposta.body) throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        for (;;) {
          const parte = await leitor.read();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 16 * 1024 * 1024) throw new Error();
          partes.push(parte.value);
        }
      } finally {
        await leitor.cancel().catch(() => {});
      }
      const corpo = registro(JSON.parse(Buffer.concat(partes).toString("utf8")));
      if (corpo.success !== true) throw new Error();
      return corpo;
    } catch {
      throw new Error("Não foi possível consultar os metadados R2.");
    }
  }

  async function wrangler(argumentos: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(path.join(process.cwd(), "node_modules/.bin/wrangler"), [...argumentos, "--env-file", "/dev/null"], {
        cwd: process.cwd(),
        env: { NODE_ENV: "production", PATH: process.env.PATH, CLOUDFLARE_ACCOUNT_ID: conta, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", CLOUDFLARE_INCLUDE_PROCESS_ENV: "false", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", CI: "true", NO_COLOR: "1" },
        maxBuffer: 16 * 1024 * 1024,
      }, (erro, saida) => erro ? reject(new Error("Não foi possível consultar ou executar o Wrangler.")) : resolve(saida));
    });
  }

  if (aplicar) {
    try {
      const ambiente = texto(process.env.DEPLOY_ENV);
      const conexao = texto(process.env.DATABASE_URL);
      // O pg reescreve estas URLs antes de decodificar o nome do banco.
      if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(conexao)) throw new Error();
      const banco = new URL(conexao);
      if (!['postgres:', 'postgresql:'].includes(banco.protocol) || !banco.hostname || !banco.username || !banco.pathname.slice(1) || [...banco.searchParams.keys()].some((chave) => /^(host|hostaddr|port|user|dbname|options|search_path)$/i.test(chave)) || banco.searchParams.getAll("schema").some((schema) => schema !== "public") || banco.searchParams.getAll("schema").length > 1) throw new Error();
      const implantacoes = lista(JSON.parse(await wrangler(["deployments", "list", "--json"])));
      const ordenadas = implantacoes.map(registro);
      if (!ordenadas.length || ordenadas.some((d) => !Number.isFinite(Date.parse(texto(d.created_on))))) throw new Error();
      ordenadas.sort((a, b) => Date.parse(texto(b.created_on)) - Date.parse(texto(a.created_on)));
      if (ordenadas[1] && Date.parse(texto(ordenadas[0].created_on)) === Date.parse(texto(ordenadas[1].created_on))) throw new Error();
      const versoes = lista(ordenadas[0].versions).map(registro);
      if (!versoes.length || versoes.some((v) => typeof v.percentage !== "number" || v.percentage < 0) || versoes.reduce((s, v) => s + (v.percentage as number), 0) !== 100) throw new Error();
      const ids = new Set<string>();
      for (const versao of versoes.filter((v) => (v.percentage as number) > 0)) {
        const id = texto(versao.version_id);
        if (ids.has(id) || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error();
        ids.add(id);
        const detalhe = registro(JSON.parse(await wrangler(["versions", "view", id, "--json"])));
        if (detalhe.id !== id) throw new Error();
        const bindings = lista(registro(detalhe.resources).bindings).map(registro);
        function binding(nome: string, tipo: string): Registro {
          const encontrados = bindings.filter((b) => b.name === nome);
          if (encontrados.length !== 1 || encontrados[0].type !== tipo) throw new Error();
          return encontrados[0];
        }
        if (binding("UPLOADS", "r2_bucket").bucket_name !== bucket || binding("DEPLOY_ENV", "plain_text").text !== ambiente || origemPublica(texto(binding("NEXT_PUBLIC_R2_PUBLIC_URL", "plain_text").text)) !== origem) throw new Error();
        const hyperdrive = texto(binding("HYPERDRIVE", "hyperdrive").id);
        const dados = registro((await consultar(`${base}/hyperdrive/configs/${encodeURIComponent(hyperdrive)}`)).result);
        const identidade = registro(dados.origin);
        if (identidade.host !== banco.hostname || identidade.database !== decodeURI(banco.pathname.slice(1)) || identidade.user !== decodeURIComponent(banco.username) || identidade.port !== Number(banco.port || 5432) || !["postgres", "postgresql"].includes(String(identidade.scheme))) throw new Error();
      }
      const personalizados = registro((await consultar(`${caminhoBucket}/domains/custom`)).result);
      const gerenciado = registro((await consultar(`${caminhoBucket}/domains/managed`)).result);
      const dominios = [...lista(personalizados.domains).map(registro), gerenciado];
      if (dominios.some((d) => typeof d.enabled !== "boolean")) throw new Error();
      const ativos = dominios.filter((d) => d.enabled === true);
      if (ativos.length !== 1 || origemPublica(`https://${texto(ativos[0].domain)}`) !== origem) throw new Error();
    } catch {
      throw new Error("Não foi possível confirmar a associação do R2, Worker e banco.");
    }
  }

  const objetos = new Map<string, string>();
  const cursores = new Set<string>();
  let cursor: string | undefined;
  do {
    const endereco = new URL(`${caminhoBucket}/objects`);
    endereco.searchParams.set("prefix", "historias/");
    if (cursor) endereco.searchParams.set("cursor", cursor);
    const pagina = await consultar(endereco.href);
    for (const item of lista(pagina.result)) {
      const chave = texto(registro(item).key);
      if (!/^historias\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(chave)) continue;
      const url = `${origem}/${chave}`;
      if (identidadeDaFoto(url) === url) objetos.set(url, chave);
      if (objetos.size > 1_000_000) throw new Error("Inventário R2 excedeu o limite seguro.");
    }
    const info = registro(pagina.result_info);
    if (typeof info.is_truncated !== "boolean") throw new Error("Paginação R2 incompleta.");
    cursor = info.is_truncated ? texto(info.cursor) : undefined;
    if (cursor && cursores.has(cursor)) throw new Error("Paginação R2 repetida.");
    if (cursor) cursores.add(cursor);
    if (cursores.size > 10_000) throw new Error("Paginação R2 excedeu o limite seguro.");
  } while (cursor);
  const autorizados = new Map(objetos);
  // The caller supplies only retirement records read from the selected database.
  for (const url of aposentadas) {
    if (identidadeDaFoto(url) !== url || !url.startsWith(`${origem}/historias/`)) throw new Error("A repetição não pertence ao armazenamento autorizado.");
    autorizados.set(url, new URL(url).pathname.slice(1));
  }
  return {
    objetos,
    async excluir(url) {
      const chave = autorizados.get(url);
      if (!aplicar || !chave) throw new Error("A foto não pertence ao inventário autorizado.");
      autorizados.delete(url);
      const endereco = `${caminhoBucket}/objects/${chave.split("/").map(encodeURIComponent).join("/")}`;
      try {
        const resposta = await fetch(endereco, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "cf-r2-data-catalog-check": "true" }, redirect: "error" });
        await resposta.body?.cancel();
        if (!resposta.ok && resposta.status !== 404) throw new Error();
        const confirmacao = await fetch(endereco, { method: "GET", headers: { Authorization: `Bearer ${token}` }, redirect: "error" });
        await confirmacao.body?.cancel();
        if (confirmacao.status !== 404) throw new Error();
      } catch {
        throw new Error("Não foi possível confirmar o descarte da foto no R2.");
      }
    },
  };
}
