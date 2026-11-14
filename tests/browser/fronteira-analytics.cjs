(async () => {
  const { chromium } = await import(process.env.CONSENTIMENTO_PLAYWRIGHT || "playwright");
  const assert = (await import("node:assert/strict")).default;
  const base = process.env.CONSENTIMENTO_TEST_URL || "http://127.0.0.1:3109";
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const contexto = await browser.newContext();
  await contexto.route("**/*", rota => new URL(rota.request().url()).origin === new URL(base).origin ? rota.continue() : rota.abort());
  await contexto.addCookies([{ name: "ndb_funcional_sintetico", value: "valor-sintetico", url: base }]);
  const pagina = await contexto.newPage();
  await pagina.goto(`${base}/sobre`);
  await pagina.getByRole("button", { name: "Aceitar medição", exact: true }).click();
  await pagina.waitForFunction(() => !!document.querySelector('iframe[title="Medição opcional"]'));
  await pagina.waitForTimeout(700);
  const frame = pagina.frames().find(item => item.url().endsWith("/api/analytics"));
  const atual = await frame.evaluate(() => {
    let leParent = false;
    let leCookie = false;
    let acessaArmazenamento = false;
    try { leParent = parent.document.title.length > 0; } catch {}
    try { leCookie = document.cookie.includes("ndb_funcional_sintetico=valor-sintetico"); } catch {}
    try { localStorage.getItem("ndb:fronteira-sintetica"); acessaArmazenamento = true; } catch {}
    return { leParent, leCookie, acessaArmazenamento, origem: window.origin, referrer: document.referrer };
  });
  const opaco = await pagina.evaluate(() => new Promise(resolve => {
    const quadro = document.createElement("iframe");
    quadro.sandbox = "allow-scripts";
    function receber(evento) {
      if (evento.source !== quadro.contentWindow || evento.data?.tipo !== "ndb:fronteira") return;
      removeEventListener("message", receber);
      resolve({ ...evento.data, origemRecebida: evento.origin });
      quadro.remove();
    }
    addEventListener("message", receber);
    quadro.srcdoc = `<script>let leParent=false;let leCookie=false;try{leParent=parent.document.title.length>0}catch{}try{leCookie=document.cookie.length>0}catch{}parent.postMessage({tipo:'ndb:fronteira',leParent,leCookie,origem:window.origin},'*')<\/script>`;
    document.body.append(quadro);
  }));
  assert.equal(opaco.leParent, false);
  assert.equal(opaco.leCookie, false);
  assert.equal(opaco.origemRecebida, "null");
  console.log(JSON.stringify({ atual, opaco, conclusao: atual.leParent ? "allow-same-origin não fornece a fronteira necessária" : "o documento atual impede acesso ao parent" }, null, 2));
  assert.equal(atual.leParent, false, "o frame de medição não pode ler o parent");
  assert.equal(atual.leCookie, false, "o frame de medição não pode ler cookies funcionais");
  assert.equal(atual.origem, "null");
  assert.equal(atual.acessaArmazenamento, false);
  assert.equal(atual.referrer, "");
  await browser.close();
})().catch(erro => { console.error(erro); process.exit(1); });
