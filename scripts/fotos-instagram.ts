// Rotina de fotos de perfil: roda no computador de quem cuida do projeto, não no Worker.
//
// 1. Pergunta ao site quais negócios estão sem foto (GET /api/fotos-instagram).
// 2. Para cada um, usa a foto da pasta manual (fotos-manuais/<@>.jpg|png|webp), se
//    existir; senão, busca a foto de perfil na API oficial da Meta (Business Discovery).
// 3. Deixa a foto quadrada, 600×600, em WebP, e envia pronta (POST /api/fotos-instagram).
//    O site só grava se o negócio continuar sem foto.
//
// Configuração em .env.fotos (veja .env.fotos.example). Uso: npm run fotos:instagram

import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import sharp from "sharp";

// O npm roda os scripts a partir da raiz do projeto.
config({ path: path.resolve(process.cwd(), ".env.fotos"), quiet: true });

const LADO = 600;
const PAUSA_ENTRE_CONSULTAS_MS = 1500;
const EXTENSOES_MANUAIS = ["jpg", "jpeg", "png", "webp"];

function obrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`Falta ${nome} no .env.fotos. Veja o .env.fotos.example.`);
    process.exit(1);
  }
  return valor;
}

const site = obrigatoria("FOTOS_SITE_URL").replace(/\/+$/, "");
const tokenDoSite = obrigatoria("FOTOS_TOKEN");
const tokenDaMeta = obrigatoria("META_ACCESS_TOKEN");
const igUserId = obrigatoria("META_IG_USER_ID");
const versaoGraph = process.env.META_GRAPH_VERSION?.trim() || "v26.0";
const pastaManual = path.resolve(process.cwd(), process.env.FOTOS_PASTA_MANUAL?.trim() || "fotos-manuais");
const limite = Number(process.env.FOTOS_LIMITE) || 100;

const agora = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Erro que interrompe a rodada inteira: token vencido, sem permissão ou limite da Meta. */
class PararRodada extends Error {}

type Negocio = { id: string; instagramUsername: string };

async function negociosSemFoto(): Promise<Negocio[]> {
  const resposta = await fetch(`${site}/api/fotos-instagram`, {
    headers: { Authorization: `Bearer ${tokenDoSite}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resposta.ok) throw new PararRodada(`O site respondeu ${resposta.status} ao listar os negócios sem foto.`);
  const { negocios } = (await resposta.json()) as { negocios: Negocio[] };
  return negocios;
}

async function fotoManual(username: string): Promise<Buffer | null> {
  for (const extensao of EXTENSOES_MANUAIS) {
    try {
      return await readFile(path.join(pastaManual, `${username}.${extensao}`));
    } catch {
      // Sem arquivo com esta extensão: tenta a próxima.
    }
  }
  return null;
}

/**
 * Endereço da foto de perfil pela API da Meta, ou null quando a conta não aparece
 * (pessoal, privada, restrita por idade ou inexistente).
 */
async function fotoNaMeta(username: string): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${versaoGraph}/${igUserId}`);
  url.searchParams.set("fields", `business_discovery.username(${username}){profile_picture_url}`);
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${tokenDaMeta}` },
    signal: AbortSignal.timeout(15_000),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as {
    business_discovery?: { profile_picture_url?: string };
    error?: { code?: number; message?: string };
  };
  if (resposta.ok) return corpo.business_discovery?.profile_picture_url ?? null;

  // Códigos de erro da Graph API: https://developers.facebook.com/docs/graph-api/guides/error-handling
  const codigo = corpo.error?.code;
  if (resposta.status === 401 || codigo === 190) throw new PararRodada("O token da Meta venceu ou foi revogado.");
  if (codigo === 10 || codigo === 200) throw new PararRodada("O token da Meta não tem permissão para a consulta.");
  if (resposta.status === 429 || codigo === 4 || codigo === 17 || codigo === 32) {
    throw new PararRodada("A Meta pediu para esperar (limite de consultas). Continua na próxima rodada.");
  }
  // Conta pessoal, privada ou inexistente: a Meta responde 400 e seguimos para a próxima.
  return null;
}

async function baixar(url: string): Promise<Buffer> {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!resposta.ok) throw new Error(`download respondeu ${resposta.status}`);
  return Buffer.from(await resposta.arrayBuffer());
}

/** Quadrada, 600×600, em WebP: fica com algumas dezenas de KB. */
function prepararFoto(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).rotate().resize(LADO, LADO, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
}

async function enviar(empresaId: string, foto: Buffer): Promise<string> {
  const dados = new FormData();
  dados.set("empresaId", empresaId);
  dados.set("foto", new File([new Uint8Array(foto)], "perfil.webp", { type: "image/webp" }));
  const resposta = await fetch(`${site}/api/fotos-instagram`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenDoSite}` },
    body: dados,
    signal: AbortSignal.timeout(30_000),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as { resultado?: string; erro?: string };
  if (!resposta.ok && resposta.status !== 404) throw new Error(corpo.erro ?? `o site respondeu ${resposta.status}`);
  return corpo.resultado ?? "nao_encontrado";
}

async function principal() {
  console.log(`[${agora()}] Rotina de fotos começou (${site}).`);
  const negocios = (await negociosSemFoto()).slice(0, limite);
  const contagem = { gravadas: 0, semFotoNaMeta: 0, jaTinhamFoto: 0, falhas: 0 };

  for (const [indice, { id, instagramUsername: username }] of negocios.entries()) {
    try {
      const manual = await fotoManual(username);
      let original = manual;
      if (!original) {
        if (indice > 0) await esperar(PAUSA_ENTRE_CONSULTAS_MS);
        const url = await fotoNaMeta(username);
        if (!url) {
          contagem.semFotoNaMeta++;
          console.log(`  @${username}: a Meta não devolveu foto (conta pessoal, privada ou inexistente).`);
          continue;
        }
        original = await baixar(url);
      }
      const resultado = await enviar(id, await prepararFoto(original));
      if (resultado === "gravada") {
        contagem.gravadas++;
        console.log(`  @${username}: foto gravada${manual ? " (da pasta manual)" : ""}.`);
      } else {
        contagem.jaTinhamFoto++;
        console.log(`  @${username}: não gravada (${resultado}).`);
      }
    } catch (erro) {
      if (erro instanceof PararRodada) throw erro;
      contagem.falhas++;
      console.error(`  @${username}: falhou: ${erro instanceof Error ? erro.message : erro}`);
    }
  }

  console.log(
    `[${agora()}] Fim: ${negocios.length} sem foto, ${contagem.gravadas} gravadas, ` +
      `${contagem.semFotoNaMeta} sem foto na Meta, ${contagem.jaTinhamFoto} já tinham foto, ${contagem.falhas} falhas.`,
  );
}

principal().catch((erro) => {
  console.error(`[${agora()}] Rodada interrompida: ${erro instanceof Error ? erro.message : erro}`);
  process.exit(1);
});
