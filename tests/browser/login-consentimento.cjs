(async () => {
  const { chromium } = await import(process.env.CONSENTIMENTO_PLAYWRIGHT || "playwright");
  const { randomBytes, randomUUID } = await import("node:crypto");
  const assert = (await import("node:assert/strict")).default;
  const base = process.env.CONSENTIMENTO_TEST_URL || "http://127.0.0.1:3109";
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const contexto = await browser.newContext();
  let externas = 0;
  await contexto.route("**/*", rota => {
    if (new URL(rota.request().url()).origin === new URL(base).origin) return rota.continue();
    externas++;
    return rota.abort();
  });
  const pagina = await contexto.newPage();
  const email = `consentimento-${randomUUID()}@example.invalid`;
  const senha = randomBytes(24).toString("hex");
  const quadro = pagina.locator('iframe[title="Medição opcional"]');
  const esperar = () => pagina.waitForTimeout(1200);
  const painelAutenticado = async () => {
    await pagina.waitForURL("**/painel*");
    await pagina.getByText("Olá, Pessoa!", { exact: false }).waitFor();
    assert.equal(await quadro.count(), 0, "painel autenticado não carrega medição");
  };

  await pagina.goto(`${base}/cadastrar?voltar=%2Fpainel`);
  await pagina.getByRole("button", { name: "Recusar medição", exact: true }).click();
  await pagina.getByLabel("Seu nome", { exact: true }).fill("Pessoa Sintética Consentimento");
  await pagina.getByLabel("E-mail", { exact: true }).fill(email);
  await pagina.getByLabel("Telefone", { exact: true }).fill("11900000000");
  await pagina.getByLabel("Senha", { exact: true }).fill(senha);
  await pagina.getByRole("button", { name: "Criar conta", exact: true }).click();
  await painelAutenticado();
  assert.equal(externas, 0, "cadastro com recusa não chama provedor");

  await pagina.locator("header details summary").click();
  await pagina.getByRole("button", { name: "Sair", exact: true }).click();
  await pagina.goto(`${base}/entrar?voltar=%2Fpainel`);
  await pagina.getByLabel("E-mail", { exact: true }).fill(email);
  await pagina.getByLabel("Senha", { exact: true }).fill(senha);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
  await painelAutenticado();
  assert.equal(externas, 0, "login real funciona com medição recusada");

  await pagina.goto(`${base}/sobre`);
  await pagina.getByRole("button", { name: "Preferências de privacidade", exact: true }).click();
  await pagina.getByRole("button", { name: "Aceitar medição", exact: true }).click();
  await quadro.waitFor({ state: "attached" });
  await esperar();
  assert.ok(externas > 0);
  await pagina.evaluate(() => {
    window.__ndbDocumento = "preservado";
    localStorage.setItem("ndb:cadastro", "rascunho-sintetico-autenticado");
  });
  await pagina.getByRole("switch", { name: "Modo escuro" }).click();
  const tema = await pagina.locator("html").getAttribute("data-tema");
  await pagina.locator("header details summary").click();
  await pagina.getByRole("link", { name: "Meu painel", exact: true }).click();
  await painelAutenticado();
  assert.equal(await pagina.evaluate(() => window.__ndbDocumento), "preservado", "transição privada usa o AppRouter real");
  await pagina.getByRole("button", { name: "Preferências de privacidade", exact: true }).click();
  await pagina.getByRole("button", { name: "Recusar medição", exact: true }).click();
  await esperar();
  await pagina.reload();
  await painelAutenticado();
  assert.equal(await pagina.locator("html").getAttribute("data-tema"), tema);
  assert.equal(await pagina.evaluate(() => localStorage.getItem("ndb:cadastro")), "rascunho-sintetico-autenticado");
  const aposRevogar = externas;
  await pagina.goto(`${base}/sobre`);
  await esperar();
  assert.equal(externas, aposRevogar, "nova visita após revogação não carrega Google");
  await pagina.goto(`${base}/painel`);
  await painelAutenticado();
  console.log(JSON.stringify({ resultado: "PASS", provas: ["cadastro sintético com recusa", "login real com recusa", "aceitação pública", "transição cliente para painel autenticado", "revogação sem logout", "nova visita autenticada", "tema e rascunho preservados"], chamadasExternasInterceptadas: externas, limite: "Não lê nem imprime tokens de sessão. Não contata o Google. Usa só a conta sintética criada nesta execução." }, null, 2));
  await browser.close();
})().catch(erro => { console.error(erro); process.exit(1); });
