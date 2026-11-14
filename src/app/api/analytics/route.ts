import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE_CONSENTIMENTO, consentimentoPositivo } from "@/lib/consentimento-analytics";
import { PAGINAS_ANALYTICS, PARAMETROS_EVENTOS } from "@/lib/medicao";

function clientIdDoConsentimento(consentimento: string): string {
  const prefixo = Number.parseInt(createHash("sha256").update(consentimento).digest("hex").slice(0, 8), 16);
  const segundos = Math.floor(Number(consentimento.split(":")[2]) / 1000);
  return `${prefixo}.${segundos}`;
}

/** O documento descartável não contém URL, título, formulário ou referrer da página visitada. */
export async function GET() {
  const consentimento = (await cookies()).get(COOKIE_CONSENTIMENTO)?.value;
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id || !/^G-[A-Z0-9]+$/.test(id) || !consentimento || !consentimentoPositivo(consentimento)) return new Response(null, { status: 204 });
  const configuracao = JSON.stringify({
    id,
    clientId: clientIdDoConsentimento(consentimento),
    paginas: PAGINAS_ANALYTICS,
    eventos: PARAMETROS_EVENTOS,
  });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Medição opcional</title></head><body><script>
  const configuracao = ${configuracao};
  configuracao.origem = location.origin;
  window.dataLayer = [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', configuracao.id, {
    client_id: configuracao.clientId,
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    page_location: configuracao.origem + '/medicao', page_referrer: '', page_title: 'Medição opcional'
  });
  addEventListener('message', function(evento) {
    if (evento.source !== parent || evento.origin !== configuracao.origem) return;
    const dados = evento.data;
    if (!dados || dados.tipo !== 'ndb:medir' || !dados.params) return;
    const caminho = Object.keys(configuracao.paginas).find(item => configuracao.origem + item === dados.params.page_location);
    if (!caminho) return;
    const parametros = { page_location: configuracao.origem + caminho, page_title: configuracao.paginas[caminho], page_referrer: '' };
    if (dados.nome === 'page_view') {
      if (['direto', 'busca', 'rede_social', 'interno', 'outro'].includes(dados.params.origem_trafego)) parametros.origem_trafego = dados.params.origem_trafego;
    } else {
      if (!Object.hasOwn(configuracao.eventos, dados.nome)) return;
      for (const [chave, valores] of Object.entries(configuracao.eventos[dados.nome])) {
        const valor = dados.params[chave];
        if (valor === undefined && chave === 'tipo' && dados.nome === 'cadastro_etapa') continue;
        if (!valores.includes(valor)) return;
        parametros[chave] = valor;
      }
    }
    gtag('event', dados.nome, parametros);
  });
  parent.postMessage({ tipo: 'ndb:pronto' }, configuracao.origem);
  </script><script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script></body></html>`;
  return new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' https://www.googletagmanager.com; connect-src https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.google.com; img-src https://*.google-analytics.com https://*.googletagmanager.com https://*.google.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-scripts",
  } });
}
