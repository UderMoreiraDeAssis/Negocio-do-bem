"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { abertoComoApp } from "@/lib/app";
import { consentimentoPositivo, lerConsentimento, lerCookie } from "@/lib/consentimento-analytics";
import { COOKIE_EVENTOS, enviarEvento, lerEventos, origemDoTrafego, paginaPermitida, sanearEvento } from "@/lib/medicao";

/**
 * Mantém um único quadro durante a visita às páginas públicas permitidas.
 * A origem opaca exige destino `*`, restrito à referência do frame atual.
 * A resposta exige `source` do mesmo frame e origem `null`.
 */
export function EventosAnalytics({ consentimento }: { consentimento: string }) {
  const caminho = usePathname();
  const quadro = useRef<HTMLIFrameElement>(null);
  const pronto = useRef(false);
  const ultimaPagina = useRef("");
  const enviouAppAberto = useRef(false);
  const consentimentoAtivo = useRef(consentimento);
  const pagina = paginaPermitida(caminho);

  useEffect(() => {
    if (consentimentoAtivo.current !== consentimento || !paginaPermitida(caminho)) {
      consentimentoAtivo.current = consentimento;
      pronto.current = false;
      ultimaPagina.current = "";
    }
    if (!paginaPermitida(caminho) || !consentimentoPositivo(lerConsentimento())) return;

    function publicarNoQuadro(nome: string, params: Record<string, string>) {
      const atual = paginaPermitida(window.location.pathname);
      if (!pronto.current || !atual || !consentimentoPositivo(lerConsentimento()) || lerConsentimento() !== consentimento) return;
      quadro.current?.contentWindow?.postMessage({
        tipo: "ndb:medir",
        nome,
        params: {
          ...params,
          page_location: location.origin + atual.caminho,
          page_title: atual.titulo,
          page_referrer: "",
        },
      }, "*");
    }

    function enviarPagina() {
      const atual = paginaPermitida(window.location.pathname);
      if (!pronto.current || !atual || !consentimentoPositivo(lerConsentimento()) || lerConsentimento() !== consentimento) return;
      if (ultimaPagina.current === window.location.pathname) return;
      ultimaPagina.current = window.location.pathname;
      publicarNoQuadro("page_view", {
        origem_trafego: origemDoTrafego(document.referrer, location.origin),
      });
    }

    function enviarPendentes() {
      if (!pronto.current) return;
      enviarPagina();
      if (!enviouAppAberto.current && abertoComoApp()) {
        enviouAppAberto.current = true;
        enviarEvento("app_aberto", {});
      }
      const valor = lerCookie(COOKIE_EVENTOS);
      if (!valor) return;
      document.cookie = `${COOKIE_EVENTOS}=; Max-Age=0; Path=/; SameSite=Lax`;
      for (const evento of lerEventos(valor, consentimento)) enviarEvento(evento.nome, evento.params);
    }

    function aoReceber(evento: MessageEvent) {
      if (evento.origin !== "null" || evento.source !== quadro.current?.contentWindow || evento.data?.tipo !== "ndb:pronto") return;
      pronto.current = true;
      enviarPendentes();
    }

    function aoClicar(evento: MouseEvent) {
      const alvo = evento.target instanceof Element ? evento.target.closest<HTMLElement>("[data-medir]") : null;
      const { medir: nome, ...params } = alvo?.dataset ?? {};
      if (nome) enviarEvento(nome, params);
    }

    window.ndbEnviarAnalytics = evento => {
      const permitido = sanearEvento(evento.nome, evento.params);
      if (!permitido) return;
      publicarNoQuadro(permitido.nome, permitido.params);
    };

    enviarPendentes();
    window.addEventListener("message", aoReceber);
    window.addEventListener("focus", enviarPendentes);
    document.addEventListener("click", aoClicar);
    return () => {
      window.removeEventListener("message", aoReceber);
      window.removeEventListener("focus", enviarPendentes);
      document.removeEventListener("click", aoClicar);
      delete window.ndbEnviarAnalytics;
    };
  }, [caminho, consentimento, pagina?.caminho]);

  return pagina ? <iframe key={consentimento} ref={quadro} src="/api/analytics" title="Medição opcional" hidden referrerPolicy="no-referrer" sandbox="allow-scripts" /> : null;
}
