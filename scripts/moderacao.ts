// Dá, tira e lista a moderação. Só o papel "moderador" no banco dá acesso a
// /moderacao (veja ehModerador em src/lib/auth/sessao.ts); por isso este script
// roda com a conexão direta do banco, que só quem cuida do projeto tem.
//
// Uso (no banco do DATABASE_URL do .env):
//   npm run moderacao -- listar
//   npm run moderacao -- dar voce@exemplo.com
//   npm run moderacao -- tirar voce@exemplo.com
//
// Em outro banco, como o de produção, passe a conexão na frente:
//   DATABASE_URL="postgresql://..." npm run moderacao -- listar

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registrarAuditoria } from "../src/lib/auditoria";

// Ações que só a moderação faz. Com usuarioId preenchido, mostram quem agiu como
// moderação, inclusive quem teve acesso por uma regra que já não vale.
const ACOES_DA_MODERACAO = [
  "empresa.aprovada",
  "empresa.rejeitada",
  "empresa.editada_pela_moderacao",
  "empresa.foto_trocada_pela_moderacao",
  "empresa.foto_removida_pela_moderacao",
  "reivindicacao.aprovada",
  "reivindicacao.aprovada_com_transferencia",
  "reivindicacao.recusada",
  "depoimento.mantido",
  "depoimento.removido",
];

const urlDoBanco = process.env.DATABASE_URL;
if (!urlDoBanco) {
  console.error("Falta DATABASE_URL. Configure no .env ou passe na frente do comando.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDoBanco }) });
const data = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

async function listar() {
  const moderadores = await db.usuario.findMany({ where: { papel: "moderador" }, orderBy: { criadoEm: "asc" } });
  console.log(`Moderação (${moderadores.length}):`);
  for (const u of moderadores) console.log(`  ${u.email}  ${u.nome}  conta criada em ${data(u.criadoEm)}`);

  const acoes = await db.registroAuditoria.groupBy({
    by: ["usuarioId"],
    where: { acao: { in: ACOES_DA_MODERACAO }, usuarioId: { not: null } },
    _count: { _all: true },
    _min: { criadoEm: true },
    _max: { criadoEm: true },
  });
  const contas = await db.usuario.findMany({ where: { id: { in: acoes.map((a) => a.usuarioId!) } } });
  console.log(`\nQuem já fez ações de moderação (${acoes.length}):`);
  for (const a of acoes) {
    const conta = contas.find((c) => c.id === a.usuarioId);
    const aviso = conta?.papel === "moderador" ? "" : "  << NÃO É MODERAÇÃO HOJE";
    console.log(
      `  ${conta?.email ?? a.usuarioId}  ${a._count._all} ações, de ${data(a._min.criadoEm!)} a ${data(a._max.criadoEm!)}${aviso}`,
    );
  }
}

async function mudarPapel(email: string, papel: "moderador" | "membro") {
  const usuario = await db.usuario.findUnique({ where: { email } });
  if (!usuario) {
    console.error(`Não existe conta com ${email}. A pessoa precisa se cadastrar antes.`);
    process.exit(1);
  }
  if (usuario.papel === papel) {
    console.log(`${email} já está como "${papel}". Nada a fazer.`);
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: usuario.id }, data: { papel } });
    await registrarAuditoria(tx, {
      usuarioId: null,
      acao: papel === "moderador" ? "usuario.moderacao_dada" : "usuario.moderacao_tirada",
      alvoTipo: "usuario",
      alvoId: usuario.id,
      detalhes: `${email}, pelo script de moderação`,
    });
  });
  console.log(papel === "moderador" ? `${email} agora é moderação.` : `${email} não é mais moderação.`);
}

async function main() {
  const { host, pathname } = new URL(urlDoBanco!);
  console.log(`Banco: ${host}${pathname}\n`);

  const [comando, email] = process.argv.slice(2);
  const emailNormalizado = email?.trim().toLowerCase();
  if (comando === "listar") return listar();
  if ((comando === "dar" || comando === "tirar") && emailNormalizado) {
    return mudarPapel(emailNormalizado, comando === "dar" ? "moderador" : "membro");
  }
  console.error("Uso: npm run moderacao -- listar | dar <e-mail> | tirar <e-mail>");
  process.exit(1);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
