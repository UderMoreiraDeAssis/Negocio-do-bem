import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// As ações rodam fora do Next: o redirect vira um erro com o destino, e a guarda da
// moderação deixa passar só quem o teste escolher.
const sessao = vi.hoisted(() => ({
  moderador: null as { id: string } | null,
  usuario: null as { id: string; emailConfirmado: boolean } | null,
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/sessao", () => ({
  exigirModerador: async () => {
    if (!sessao.moderador) throw new Error("redirect:/404");
    return { ...sessao.moderador, nome: "Moderação", email: "mod@exemplo.com", moderador: true, emailConfirmado: true };
  },
  exigirUsuario: async (voltar: string) => {
    if (!sessao.usuario) throw new Error(`redirect:/entrar?voltar=${voltar}`);
    return { ...sessao.usuario, nome: "Conta", email: "conta@exemplo.com", moderador: false };
  },
}));

const { after } = await import("next/server");
const { aprovarTrocaDeArrobaAcao, cancelarTrocaDeArrobaAcao, pedirTrocaDeArrobaAcao, recusarTrocaDeArrobaAcao } = await import(
  "@/acoes/arroba"
);
const { trocarArrobaDaEmpresa } = await import("@/acoes/empresas");
const { enderecoAtual } = await import("@/lib/troca-de-arroba");

async function limparBanco() {
  await db.$executeRawUnsafe(`TRUNCATE "RegistroAuditoria", "TrocaDeArroba", "EnderecoAntigo", "LiberacaoClube", "EmpresaMembro", "Empresa", "Usuario" CASCADE`);
}

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

/** Para onde a ação mandou a pessoa. */
async function destino(acao: Promise<unknown>): Promise<string> {
  try {
    await acao;
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("redirect:")) return erro.message.slice("redirect:".length);
    throw erro;
  }
  throw new Error("A ação não redirecionou.");
}

function criarEmpresa(instagramUsername: string, extra: Record<string, unknown> = {}) {
  return db.empresa.create({
    data: { instagramUsername, nome: "Padaria Flor", resumo: "Pão de bairro", categoria: "Alimentação", cidade: "Recife", uf: "PE", moderacao: "aprovada", ...extra },
  });
}

let moderador: { id: string };
let dona: { id: string };
let outra: { id: string };
let empresaId: string;

const pedir = (arroba: string, empresa = empresaId) => pedirTrocaDeArrobaAcao(undefined, formulario({ empresaId: empresa, arroba }));
const pendente = () => db.trocaDeArroba.findFirstOrThrow({ where: { empresaId, status: "pendente" } });
const empresa = () => db.empresa.findUniqueOrThrow({ where: { id: empresaId } });

beforeEach(async () => {
  await limparBanco();
  vi.mocked(after).mockClear();
  [moderador, dona, outra] = await Promise.all(
    ["mod", "dona", "outra"].map((nome) => db.usuario.create({ data: { nome, email: `${nome}@exemplo.com` } })),
  );
  const criada = await criarEmpresa("fabsreis", { instagramUserId: "123", busca: "padaria flor fabsreis" });
  empresaId = criada.id;
  await db.empresaMembro.create({ data: { empresaId, usuarioId: dona.id } });
  sessao.moderador = null;
  sessao.usuario = { id: dona.id, emailConfirmado: true };
});
afterAll(async () => {
  await limparBanco();
  await db.$disconnect();
});

describe("o dono pede a troca do @", () => {
  it("o pedido vai para a fila, o @ ainda não muda e a moderação é avisada", async () => {
    expect(await destino(pedir("instagram.com/OFabsReis"))).toBe("/painel/fabsreis?aviso=arroba_pedido_enviado#arroba");

    expect(await pendente()).toMatchObject({ usuarioId: dona.id, arrobaAntigo: "fabsreis", arrobaNovo: "ofabsreis" });
    expect((await empresa()).instagramUsername).toBe("fabsreis");
    expect(after).toHaveBeenCalledTimes(1);
    expect(await db.registroAuditoria.findFirst({ where: { acao: "empresa.arroba_pedido" } })).toMatchObject({
      usuarioId: dona.id,
      detalhes: "@fabsreis → @ofabsreis",
    });
  });

  it("recusa o @ inválido, o mesmo @ e o @ de outro negócio", async () => {
    await criarEmpresa("padariavizinha");

    expect((await pedir("instagram.com/p/abc"))?.erros?.arroba).toMatch(/Digite o @/);
    expect((await pedir("@FabsReis"))?.erros?.arroba).toBe("Este já é o @ do seu negócio.");
    expect((await pedir("padariavizinha"))?.erros?.arroba).toMatch(/já é de outro negócio/);
    expect(await db.trocaDeArroba.count()).toBe(0);
  });

  it("só um pedido em análise por negócio, mesmo com envios simultâneos", async () => {
    const respostas = await Promise.allSettled([pedir("ofabsreis"), pedir("fabs.reis"), pedir("fabsreis_oficial")]);

    // Só o pedido que entrou redireciona (o redirect de teste é um erro); os outros voltam com o aviso.
    expect(respostas.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await db.trocaDeArroba.count()).toBe(1);
    expect((await pedir("outro.arroba"))?.erros?.arroba).toMatch(/em análise/);
  });

  it("quem não é dono não pede, e quem não confirmou o e-mail também não", async () => {
    sessao.usuario = { id: outra.id, emailConfirmado: true };
    expect((await pedir("ofabsreis"))?.erros?.arroba).toMatch(/Só um dono/);

    sessao.usuario = { id: dona.id, emailConfirmado: false };
    expect((await pedir("ofabsreis"))?.erro).toMatch(/confirme o seu e-mail/);
    expect(await db.trocaDeArroba.count()).toBe(0);
  });

  it("o dono cancela o pedido em análise e pode pedir de novo", async () => {
    await destino(pedir("ofabsreis"));

    expect(await destino(cancelarTrocaDeArrobaAcao(formulario({ empresaId })))).toBe("/painel/fabsreis?aviso=arroba_pedido_cancelado#arroba");

    expect(await db.trocaDeArroba.count({ where: { status: "cancelada" } })).toBe(1);
    expect(await destino(pedir("ofabsreis"))).toContain("arroba_pedido_enviado");
  });

  it("o dono não troca o @ direto pela edição do perfil", async () => {
    const estado = await trocarArrobaDaEmpresa(undefined, formulario({ empresaId, instagram: "ofabsreis" }));

    expect(estado?.erros?.instagram).toMatch(/Peça a troca/);
    expect((await empresa()).instagramUsername).toBe("fabsreis");
  });

  it("um negócio sem Instagram pede para ligar um @", async () => {
    const semInstagram = await criarEmpresa("padaria-flor-recife");
    await db.empresaMembro.create({ data: { empresaId: semInstagram.id, usuarioId: dona.id } });

    expect(await destino(pedir("padariaflor", semInstagram.id))).toBe("/painel/padaria-flor-recife?aviso=arroba_pedido_enviado#arroba");
  });
});

describe("a moderação decide", () => {
  beforeEach(async () => {
    await destino(pedir("ofabsreis"));
    vi.mocked(after).mockClear();
    sessao.moderador = moderador;
  });
  const aprovar = async () => aprovarTrocaDeArrobaAcao(formulario({ trocaId: (await pendente()).id }));

  it("aprovada, o @ e o endereço mudam, o antigo leva ao novo e os IDs do @ antigo saem", async () => {
    expect(await destino(aprovar())).toBe("/moderacao?aba=arroba&aviso=arroba_aprovado#pedidos");

    const trocada = await empresa();
    expect(trocada).toMatchObject({ instagramUsername: "ofabsreis", instagramUserId: null, instagramIgsid: null });
    expect(trocada.busca).toContain("ofabsreis");
    expect(await enderecoAtual("fabsreis")).toBe("ofabsreis");
    expect(await db.trocaDeArroba.findFirst()).toMatchObject({ status: "aprovada", decididoPorId: moderador.id });
    expect(await db.registroAuditoria.findFirst({ where: { acao: "empresa.arroba_trocado_pela_moderacao" } })).toMatchObject({
      usuarioId: moderador.id,
      detalhes: "@fabsreis (fabsreis) → @ofabsreis",
    });
    // O aviso ao dono e a foto do @ novo vão depois da resposta.
    expect(after).toHaveBeenCalledTimes(1);
    // O @ antigo continua livre para outro negócio.
    await expect(criarEmpresa("fabsreis")).resolves.toBeTruthy();
  });

  it("aprovada, não suspende o Clube do Bem, porque a moderação conferiu o @", async () => {
    await db.liberacaoClube.create({ data: { empresaId, usuarioId: dona.id, cnpj: "11222333000181" } });

    await destino(aprovar());

    expect((await db.liberacaoClube.findFirstOrThrow()).status).toBe("liberada");
  });

  it("não aprova se outro negócio ocupou o @ novo enquanto isso", async () => {
    await criarEmpresa("ofabsreis");

    expect(await destino(aprovar())).toBe("/moderacao?aba=arroba&aviso=arroba_arroba_em_uso#pedidos");
    expect((await empresa()).instagramUsername).toBe("fabsreis");
    expect((await pendente()).status).toBe("pendente");
  });

  it("não aprova se o @ do negócio mudou depois do pedido", async () => {
    await db.empresa.update({ where: { id: empresaId }, data: { instagramUsername: "fabsreis.novo" } });

    expect(await destino(aprovar())).toContain("aviso=arroba_arroba_mudou");
    expect((await empresa()).instagramUsername).toBe("fabsreis.novo");
  });

  it("recusada, com o motivo, o @ não muda e o dono é avisado", async () => {
    const { id } = await pendente();

    expect(await destino(recusarTrocaDeArrobaAcao(formulario({ trocaId: id, motivo: "O perfil não é do negócio" })))).toBe(
      "/moderacao?aba=arroba&aviso=arroba_recusado#pedidos",
    );

    expect((await empresa()).instagramUsername).toBe("fabsreis");
    expect(await db.trocaDeArroba.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "recusada", motivo: "O perfil não é do negócio" });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("um pedido já decidido não muda de novo", async () => {
    const { id } = await pendente();
    await destino(recusarTrocaDeArrobaAcao(formulario({ trocaId: id })));

    expect(await destino(aprovarTrocaDeArrobaAcao(formulario({ trocaId: id })))).toContain("aviso=arroba_ja_decidido");
    expect((await empresa()).instagramUsername).toBe("fabsreis");
  });

  it("só a moderação decide", async () => {
    sessao.moderador = null;

    expect(await destino(aprovar())).toBe("/404");
    expect((await empresa()).instagramUsername).toBe("fabsreis");
  });
});
