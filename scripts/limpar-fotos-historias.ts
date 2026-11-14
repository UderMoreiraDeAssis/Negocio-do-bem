const [acao = "listar", ...fotos] = process.argv.slice(2);

function ajuda() {
  console.log("Uso: npm run fotos:limpar -- listar [URL ...]");
  console.log("     npm run fotos:limpar -- descartar URL [URL ...]");
  console.log("O diagnóstico não apaga fotos. O descarte exige domínio exclusivo confirmado.");
}

/** Servidor e nome do banco, nunca a senha. */
function descreverBanco(endereco: string): string {
  try {
    const url = new URL(endereco);
    return `${url.host}${url.pathname}`;
  } catch {
    return "endereço do DATABASE_URL inválido";
  }
}

/** O Prisma põe o trecho do código antes da causa: a causa é a última linha da mensagem. */
function motivoDoErro(erro: unknown): string {
  const linhas = (erro instanceof Error ? erro.message : String(erro)).split("\n").filter((linha) => linha.trim());
  return linhas.at(-1) ?? "erro sem mensagem";
}

async function main() {
  if (acao === "--ajuda") return ajuda();
  if (!["listar", "descartar"].includes(acao) || (acao === "descartar" && fotos.length === 0)) {
    ajuda();
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("Defina DATABASE_URL explicitamente. Este comando não carrega arquivos .env.");
    process.exitCode = 1;
    return;
  }
  if (acao === "descartar" && process.env.FOTOS_DOMINIO_EXCLUSIVO !== "confirmado") {
    console.error("Exclusão bloqueada. Confirme todos os bancos e escritores que usam o armazenamento antes de habilitar FOTOS_DOMINIO_EXCLUSIVO.");
    process.exitCode = 1;
    return;
  }

  const { db } = await import("../src/lib/db");
  try {
    const { descreverArmazenamento, limparFotosHistorias } = await import("../src/lib/armazenamento");
    // Quem roda o comando precisa saber qual armazenamento foi consultado.
    console.log(`Armazenamento lido: ${descreverArmazenamento()}`);
    console.log(`Banco lido: ${descreverBanco(process.env.DATABASE_URL ?? "")}`);
    const resultado = await limparFotosHistorias(fotos, acao === "descartar");
    console.log(acao === "listar" ? "Diagnóstico. Nenhum descarte foi aplicado." : "Resultado do descarte selecionado:");
    console.table(resultado);
    if (resultado.some((foto) => foto.status === "falha" || foto.status === "bloqueada")) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((erro) => {
  console.error("Não foi possível concluir a limpeza. Não trate uma falha como descarte confirmado.");
  console.error(`Motivo: ${motivoDoErro(erro)}`);
  process.exitCode = 1;
});
