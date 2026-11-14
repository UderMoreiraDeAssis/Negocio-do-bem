export const COOKIE_CONSENTIMENTO = "ndb_consentimento";
export const VERSAO_DO_AVISO = "1";
export const VALIDADE_DA_ESCOLHA = 180 * 24 * 60 * 60;

let armazenamentoDisponivel = true;

/** A versão e a data impedem que uma escolha antiga autorize um aviso novo. */
function escolhaValida(valor: string | undefined): boolean {
  const [versao, escolha, data, extra] = valor?.split(":") ?? [];
  const instante = Number(data);
  return extra === undefined && versao === VERSAO_DO_AVISO && (escolha === "aceito" || escolha === "recusado") &&
    /^\d+$/.test(data ?? "") && Number.isSafeInteger(instante) && instante > Date.now() - VALIDADE_DA_ESCOLHA * 1000 && instante <= Date.now();
}

export function consentimentoPositivo(valor: string | undefined): boolean {
  return escolhaValida(valor) && valor?.split(":")[1] === "aceito";
}

export function lerCookie(nome: string): string | undefined {
  try {
    const par = document.cookie.split("; ").find(item => item.startsWith(`${nome}=`));
    return par === undefined ? undefined : decodeURIComponent(par.slice(nome.length + 1));
  } catch {
    return undefined;
  }
}

export function lerConsentimento(): string | undefined {
  const valor = armazenamentoDisponivel ? lerCookie(COOKIE_CONSENTIMENTO) : undefined;
  return escolhaValida(valor) ? valor : undefined;
}

/** Uma gravação recusada pelo navegador nunca autoriza medição. */
export function gravarEscolha(aceitar: boolean): boolean {
  const valor = `${VERSAO_DO_AVISO}:${aceitar ? "aceito" : "recusado"}:${Date.now()}`;
  try {
    document.cookie = `${COOKIE_CONSENTIMENTO}=${valor}; Max-Age=${VALIDADE_DA_ESCOLHA}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    armazenamentoDisponivel = lerCookie(COOKIE_CONSENTIMENTO) === valor;
  } catch {
    armazenamentoDisponivel = false;
  }
  return armazenamentoDisponivel;
}

/** Remove só cookies opcionais. Sessão, OAuth e preferências funcionais ficam intactos. */
export function limparMedicao(): void {
  try {
    const nomes = document.cookie.split("; ").map(item => item.split("=")[0])
      .filter(nome => nome === "ndb_eventos" || /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(nome));
    const partes = location.hostname.split(".");
    const dominios = ["", ...partes.map((_, indice) => `; Domain=.${partes.slice(indice).join(".")}`)];
    for (const nome of nomes) for (const dominio of dominios) {
      document.cookie = `${nome}=; Max-Age=0; Path=/; SameSite=Lax${dominio}`;
    }
  } catch {
    // Sem acesso ao armazenamento, a escolha continua sem autorização.
  }
}
