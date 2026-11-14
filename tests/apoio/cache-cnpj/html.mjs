export function exigir(condicao, codigo) {
  if (!condicao) throw new Error(`[HARNESS37] ${codigo}`);
}
export function decodificar(valor) {
  const entidades = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return valor.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt);/gi, (_, entidade) => {
    if (entidade.startsWith("#x")) return String.fromCodePoint(parseInt(entidade.slice(2), 16));
    if (entidade.startsWith("#")) return String.fromCodePoint(parseInt(entidade.slice(1), 10));
    return entidades[entidade.toLowerCase()];
  });
}
export function atributo(tag, nome) {
  const resultado = tag.match(new RegExp(`(?:^|\\s)${nome}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return resultado ? decodificar(resultado[1] ?? resultado[2] ?? "") : undefined;
}
function fimDaTag(html, inicio) {
  let aspas;
  for (let i = inicio + 1; i < html.length; i++) {
    const caractere = html[i];
    if (aspas) {
      if (caractere === aspas) aspas = undefined;
    } else if (caractere === '"' || caractere === "'") aspas = caractere;
    else if (caractere === ">") return i + 1;
  }
  return html.length;
}

// Lê o HTML do harness sem executar scripts. Não garante conformidade com um navegador nem sanitização para publicação.
function* partesHtml(html) {
  const textoBruto = new Set(["script", "style", "title", "textarea", "xmp", "iframe", "noembed", "noframes"]);
  const cabeca = /<\/?([a-z][^\t\n\f\r />]*)/iy;
  let indice = 0;
  while (indice < html.length) {
    const inicio = html.indexOf("<", indice);
    if (inicio < 0) {
      yield { texto: true, conteudo: html.slice(indice) };
      return;
    }
    if (inicio > indice) yield { texto: true, conteudo: html.slice(indice, inicio) };
    if (html.startsWith("<!--", inicio)) {
      const fechamento = html.indexOf("-->", inicio + 4);
      indice = fechamento < 0 ? html.length : fechamento + 3;
      yield { comentario: true, conteudo: html.slice(inicio, indice) };
      continue;
    }
    cabeca.lastIndex = inicio;
    const resultado = cabeca.exec(html);
    if (!resultado) {
      yield { texto: true, conteudo: "<" };
      indice = inicio + 1;
      continue;
    }
    const nome = resultado[1].toLowerCase();
    const fechamento = html[inicio + 1] === "/";
    const fim = fimDaTag(html, inicio);
    const abertura = html.slice(inicio, fim);
    indice = fim;
    let corpo;
    if (textoBruto.has(nome) && !fechamento) {
      const terminador = new RegExp(`</${nome}(?=[\\t\\n\\f\\r />])`, "gi");
      terminador.lastIndex = fim;
      const final = terminador.exec(html);
      corpo = html.slice(fim, final?.index ?? html.length);
      indice = final ? fimDaTag(html, final.index) : html.length;
    }
    yield { nome, fechamento, abertura, corpo, inicio, fim: indice, conteudo: html.slice(inicio, indice) };
  }
}

function tags(html, nome) {
  return [...partesHtml(html)].filter(parte => parte.nome === nome && !parte.fechamento);
}

function textoVisivel(html) {
  return decodificar([...partesHtml(html)].filter(parte => parte.texto).map(parte => parte.conteudo).join(""));
}

export function formularioDeEntrada(html, pagina) {
  const candidatos = elementos(html, "form")
    .map(trecho => ({ atributos: trecho.abertura, entradas: tags(trecho.corpo, "input").map(tag => tag.abertura) }))
    .filter(({ entradas }) => {
      const nomes = entradas.map(tag => atributo(tag, "name"));
      return nomes.includes("email") && nomes.includes("senha");
    });
  exigir(candidatos.length === 1, "formulario-entrada-unico");
  const formulario = candidatos[0];
  exigir(atributo(formulario.atributos, "method")?.toLowerCase() === "post", "metodo-formulario");
  const destino = new URL(atributo(formulario.atributos, "action") || pagina, pagina);
  exigir(destino.origin === new URL(pagina).origin, "destino-formulario");
  const dados = new FormData();
  for (const tag of formulario.entradas) {
    const nome = atributo(tag, "name");
    if (nome && atributo(tag, "type")?.toLowerCase() === "hidden") dados.append(nome, atributo(tag, "value") ?? "");
  }
  exigir([...dados.keys()].filter(nome => /^\$ACTION_(?:ID|REF)_/.test(nome)).length === 1, "seletor-server-action");
  return { destino, dados };
}
export function sanitizarHtml(html) {
  return [...partesHtml(html)].map(parte => {
    if (parte.nome === "script" && !parte.fechamento) return "<!-- script omitido -->";
    if (parte.nome !== "input" || !atributo(parte.abertura, "name")?.startsWith("$ACTION")) return parte.conteudo;
    return parte.abertura.replace(/\bvalue=(?:"[^"]*"|'[^']*')/gi, 'value="[omitido]"');
  }).join("");
}
function elementos(html, nome) {
  const encontrados = [];
  const abertos = [];
  for (const tag of partesHtml(html)) {
    if (tag.nome !== nome) continue;
    if (!tag.fechamento) abertos.push({ abertura: tag.abertura, inicio: tag.fim });
    else {
      const aberto = abertos.pop();
      exigir(aberto, `estrutura-${nome}`);
      encontrados.push({ abertura: aberto.abertura, corpo: html.slice(aberto.inicio, tag.inicio), inicio: aberto.inicio, fim: tag.inicio });
    }
  }
  exigir(abertos.length === 0, `estrutura-${nome}`);
  return encontrados;
}

function pedidoNoFormulario(formulario, pedido) {
  return tags(formulario.corpo, "input")
    .some(tag => atributo(tag.abertura, "name") === "reivindicacaoId" && atributo(tag.abertura, "value") === pedido);
}

/** Lê apenas a instrução de conclusão emitida pelo React instalado, sem executar JavaScript. */
function segmentosConcluidos(html) {
  const pares = new Map();
  for (const script of tags(html, "script")) {
    const tipo = atributo(script.abertura, "type");
    if (tipo && !/^(?:text|application)\/javascript$/i.test(tipo)) continue;
    const chamada = script.corpo.match(/\$R(C|S)\("([\w:.-]*[BS]:[0-9a-f]+)","([\w:.-]*[SP]:[0-9a-f]+)"\)\s*;?\s*$/);
    if (!chamada) continue;
    const prefixo = script.corpo.slice(0, chamada.index).trim();
    const mover = chamada[1] === "S";
    if (prefixo && !prefixo.startsWith(mover ? "$RS=function(" : "$RB=[];$RV=function(")) continue;
    const [limite, segmento] = mover ? [chamada[3], chamada[2]] : [chamada[2], chamada[3]];
    exigir(/S:[0-9a-f]+$/.test(segmento) && limite === segmento.replace(/S:([0-9a-f]+)$/, mover ? "P:$1" : "B:$1"), "segmento-correlacionado");
    exigir(!pares.has(limite), "segmento-correlacionado-unico");
    pares.set(limite, segmento);
  }
  return pares;
}

export function observarFila(html, empresa, pedido, marcador) {
  const renderizado = sanitizarHtml(html);
  const fichas = elementos(renderizado, "article").filter(ficha =>
    elementos(ficha.corpo, "form").some(formulario => pedidoNoFormulario(formulario, pedido)));
  exigir(fichas.length <= 1, "ficha-unica");
  if (!fichas.length) return { ficha: false, controles: false, marcadorRenderizado: false };
  const ficha = fichas[0];
  const pares = segmentosConcluidos(html);
  const segmentos = elementos(renderizado, "div");
  const limites = tags(renderizado, "template");
  const ancestraisOcultos = trecho => segmentos.filter(segmento =>
    segmento.inicio <= trecho.inicio && segmento.fim >= trecho.fim && /\shidden(?:\s|=|>)/.test(segmento.abertura));
  function segmentoConcluido(segmento, visitados = new Set()) {
    const id = atributo(segmento.abertura, "id");
    if (!id || visitados.has(id)) return false;
    const destinos = limites.filter(limite => pares.get(atributo(limite.abertura, "id")) === id);
    if (destinos.length !== 1) return false;
    const proximos = new Set(visitados).add(id);
    return ancestraisOcultos(destinos[0]).every(ancestral => segmentoConcluido(ancestral, proximos));
  }
  if (!ancestraisOcultos(ficha).every(segmento => segmentoConcluido(segmento))) {
    return { ficha: false, controles: false, marcadorRenderizado: false };
  }
  const ids = tags(ficha.corpo, "input").map(tag => tag.abertura)
    .filter(tag => atributo(tag, "name") === "reivindicacaoId").map(tag => atributo(tag, "value"));
  exigir(ids.every(id => id === pedido), "pedido-pertence-a-uma-ficha");
  const formularios = elementos(ficha.corpo, "form").filter(formulario => pedidoNoFormulario(formulario, pedido));
  const controles = ["modo", "motivo"].every(nome => formularios.some(formulario =>
    tags(formulario.corpo, "input").some(tag => atributo(tag.abertura, "name") === nome)));
  let dados = ficha.corpo;
  for (const limite of tags(ficha.corpo, "template")) {
    const id = atributo(limite.abertura, "id");
    if (!id || !id.includes("B:")) continue;
    exigir(/^[\w:.-]*B:[0-9a-f]+$/.test(id), "segmento-correlacionado-formato");
    exigir(pares.has(id), "segmento-correlacionado-a-ficha");
    const encontrados = segmentos.filter(segmento => atributo(segmento.abertura, "id") === pares.get(id) && /\shidden(?:\s|=|>)/.test(segmento.abertura));
    exigir(encontrados.length === 1, "segmento-correlacionado-unico");
    dados += encontrados[0].corpo;
  }
  return {
    ficha: textoVisivel(ficha.corpo).includes(empresa),
    controles,
    marcadorRenderizado: elementos(dados, "span").some(trecho => textoVisivel(trecho.corpo).includes(marcador)),
  };
}
