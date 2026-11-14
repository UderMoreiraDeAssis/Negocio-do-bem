import { consentimentoPositivo, lerConsentimento } from "@/lib/consentimento-analytics";
import { CATEGORIAS, UFS } from "@/lib/dominio";

export const COOKIE_EVENTOS = "ndb_eventos";
const MAXIMO_DE_EVENTOS = 5;
export type MetodoDeAcesso = "senha" | "google" | "link";
export type TipoDeCadastro = "indicacao" | "dono";
export type CanalDeContato = "telefone" | "whatsapp" | "instagram" | "site" | "email";

/** Os eventos do funil (#203) com valores de listas fechadas, sem identificadores pessoais ou cidade. */
export type Evento =
  | { nome: "sign_up"; params: { method: Exclude<MetodoDeAcesso, "link"> } }
  | { nome: "login"; params: { method: MetodoDeAcesso } }
  | { nome: "negocio_cadastrado"; params: { tipo: TipoDeCadastro; categoria: string; uf: string; cidade: string; com_instagram: "sim" | "nao" } }
  | { nome: "perfil_reivindicado"; params: { method: "documento" | "instagram"; resultado: "verificada" | "em_analise" } }
  | { nome: "depoimento_publicado"; params: { categoria: string } }
  | { nome: "negocio_favoritado"; params: { categoria: string; uf: string } }
  | { nome: "oferta_criada"; params: { categoria: string; uf: string } }
  | { nome: "cupom_gerado"; params: { categoria: string; uf: string } }
  | { nome: "cupom_usado"; params: { categoria: string; uf: string } };

export type EventoPermitido = { nome: string; params: Record<string, string> };
export const PARAMETROS_EVENTOS: Record<string, Record<string, readonly string[]>> = {
  sign_up: { method: ["senha", "google"] },
  login: { method: ["senha", "google", "link"] },
  negocio_cadastrado: { tipo: ["indicacao", "dono"], categoria: CATEGORIAS, uf: UFS, com_instagram: ["sim", "nao"] },
  perfil_reivindicado: { method: ["documento", "instagram"], resultado: ["verificada", "em_analise"] },
  depoimento_publicado: { categoria: CATEGORIAS },
  negocio_favoritado: { categoria: CATEGORIAS, uf: UFS },
  oferta_criada: { categoria: CATEGORIAS, uf: UFS },
  cupom_gerado: { categoria: CATEGORIAS, uf: UFS },
  cupom_usado: { categoria: CATEGORIAS, uf: UFS },
  contato_negocio: { canal: ["telefone", "whatsapp", "instagram", "site", "email"], categoria: CATEGORIAS, uf: UFS },
  cadastro_etapa: { etapa: ["arroba", "escolha", "nome", "onde", "causas", "contatos", "voce", "fim"], tipo: ["indicacao", "dono"] },
  app_instalado: {},
  app_aberto: {},
  instalacao_aparelho: { aparelho: ["iphone", "android"] },
};

/** Cidade e parâmetros livres saem; categoria, UF e métodos vêm apenas de listas fechadas. */
export function sanearEvento(nome: string, params: Record<string, unknown>): EventoPermitido | null {
  const regra = Object.hasOwn(PARAMETROS_EVENTOS, nome) ? PARAMETROS_EVENTOS[nome] : undefined;
  if (!regra) return null;
  const filtrados: Record<string, string> = {};
  for (const [chave, valores] of Object.entries(regra)) {
    const valor = params[chave];
    if (valor === undefined && chave === "tipo" && nome === "cadastro_etapa") continue;
    if (typeof valor !== "string" || !valores.includes(valor)) return null;
    filtrados[chave] = valor;
  }
  return { nome, params: filtrados };
}

export const PAGINAS_ANALYTICS: Record<string, string> = {
  "/": "Início",
  "/explorar": "Explorar",
  "/sobre": "Como funciona",
  "/cidades": "Cidades",
  "/embaixadores": "Embaixadores do bem",
  "/clube-do-bem": "Clube do Bem",
  "/vagas": "Vagas",
  "/vagas/talentos": "Banco de talentos",
  "/tipos": "Categorias",
  "/cupons": "Ofertas do Clube do Bem",
  "/favoritos": "Favoritos",
  "/participar": "Cadastrar negócio",
  "/instalacao": "Instalação",
  "/instalacao/iphone": "Instalação iPhone",
  "/instalacao/android": "Instalação Android",
  "/empresas/perfil": "Perfil de negócio",
  "/cidades/cidade": "Negócios por cidade",
  "/tipos/tipo": "Negócios por categoria",
};

/** Rotas variáveis nunca levam o identificador ao provedor. Causas e áreas privadas ficam fora da medição. */
export function paginaPermitida(caminho: string): { caminho: string; titulo: string } | null {
  if (Object.hasOwn(PAGINAS_ANALYTICS, caminho)) return { caminho, titulo: PAGINAS_ANALYTICS[caminho] };
  if (/^\/empresas\/[a-z0-9_.-]+$/.test(caminho)) return { caminho: "/empresas/perfil", titulo: "Perfil de negócio" };
  if (/^\/cidades\/[a-z0-9-]+$/.test(caminho)) return { caminho: "/cidades/cidade", titulo: "Negócios por cidade" };
  if (/^\/tipos\/[a-z0-9-]+$/.test(caminho)) return { caminho: "/tipos/tipo", titulo: "Negócios por categoria" };
  return null;
}

/** A origem é uma classe fixa. Nenhum domínio, caminho ou parâmetro é transmitido. */
export function origemDoTrafego(referrer: string, origem: string): string {
  if (!referrer) return "direto";
  try {
    const url = new URL(referrer);
    if (url.origin === origem) return "interno";
    if (["www.google.com", "www.google.com.br", "www.bing.com", "duckduckgo.com"].includes(url.hostname)) return "busca";
    if (["www.instagram.com", "l.instagram.com", "www.facebook.com", "l.facebook.com", "t.co"].includes(url.hostname)) return "rede_social";
  } catch {
    return "outro";
  }
  return "outro";
}

/** A fila só vale para a escolha positiva que existia quando a ação terminou. */
export function lerEventos(valor: string | undefined, consentimento: string | undefined): EventoPermitido[] {
  if (!valor || !consentimentoPositivo(consentimento)) return [];
  try {
    const dados: unknown = JSON.parse(valor);
    if (typeof dados !== "object" || dados === null) return [];
    const fila = dados as { consentimento?: unknown; eventos?: unknown };
    if (fila.consentimento !== consentimento || !Array.isArray(fila.eventos)) return [];
    return fila.eventos.flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null) return [];
      const { nome, params } = item as Record<string, unknown>;
      if (typeof nome !== "string" || typeof params !== "object" || params === null || Array.isArray(params)) return [];
      const evento = sanearEvento(nome, params as Record<string, unknown>);
      return evento ? [evento] : [];
    }).slice(-MAXIMO_DE_EVENTOS);
  } catch {
    return [];
  }
}

export function juntarEvento(valor: string | undefined, evento: Evento, consentimento: string): string {
  const permitido = sanearEvento(evento.nome, evento.params);
  return JSON.stringify({ consentimento, eventos: [...lerEventos(valor, consentimento), ...(permitido ? [permitido] : [])].slice(-MAXIMO_DE_EVENTOS) });
}

declare global {
  interface Window {
    gtag?: (...argumentos: unknown[]) => void;
    ndbEnviarAnalytics?: (evento: EventoPermitido) => void;
  }
}

/** Não guarda chamadas anteriores ao consentimento nem durante áreas privadas. */
export function enviarEvento(nome: string, params: Record<string, string | undefined>): void {
  if (!consentimentoPositivo(lerConsentimento()) || !paginaPermitida(window.location.pathname)) return;
  const evento = sanearEvento(nome, params);
  if (evento) window.ndbEnviarAnalytics?.(evento);
}

export function medirContato(canal: CanalDeContato, empresa: { categoria: string; uf: string }) {
  return { "data-medir": "contato_negocio", "data-canal": canal, "data-categoria": empresa.categoria, "data-uf": empresa.uf };
}
