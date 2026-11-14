"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { EventosAnalytics } from "@/components/EventosAnalytics";
import { consentimentoPositivo, gravarEscolha, lerConsentimento, limparMedicao, VERSAO_DO_AVISO } from "@/lib/consentimento-analytics";

function assinar(ouvinte: () => void) {
  window.addEventListener("ndb:preferencia", ouvinte);
  window.addEventListener("focus", ouvinte);
  return () => {
    window.removeEventListener("ndb:preferencia", ouvinte);
    window.removeEventListener("focus", ouvinte);
  };
}

function lerEscolhaNoCliente(): string | null {
  return lerConsentimento() ?? null;
}

/** A recusa preserva o acesso ao site e todas as preferências funcionais. */
export function PreferenciasAnalytics() {
  const escolha = useSyncExternalStore(assinar, lerEscolhaNoCliente, () => undefined);
  const [aberto, definirAberto] = useState(false);
  const [erro, definirErro] = useState(false);

  useEffect(() => {
    if (escolha !== undefined && !consentimentoPositivo(escolha ?? undefined)) limparMedicao();
  }, [escolha]);

  function escolher(aceitar: boolean) {
    delete window.ndbEnviarAnalytics;
    limparMedicao();
    const salvo = gravarEscolha(aceitar);
    window.dispatchEvent(new Event("ndb:preferencia"));
    definirErro(!salvo);
    definirAberto(!salvo);
  }

  return <>
    <button type="button" className="block cursor-pointer text-left hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral" onClick={() => definirAberto(true)}>
      Preferências de privacidade
    </button>
    {(aberto || escolha === null) && <section aria-labelledby="preferencias-titulo" className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 border-t border-linha bg-superficie px-4 py-5 shadow-lg sm:bottom-0 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="max-w-2xl space-y-2">
          <h2 id="preferencias-titulo" className="text-lg font-semibold text-tinta">Você escolhe se quer ajudar com a medição</h2>
          <p className="text-sm leading-relaxed text-suave">
            Com sua permissão, o Google Analytics mede visitas, páginas públicas e interações permitidas em um espaço isolado.
            Ele não acessa os cookies da sua conta. Não enviamos buscas, formulários nem sua navegação na conta, reivindicação ou moderação.
            Recusar não muda o uso do site ou o login.
          </p>
          <p className="text-sm text-suave">
            Você pode mudar a escolha neste rodapé. <Link href="/sobre#privacidade" className="link">Saiba mais sobre privacidade</Link>.
            <span className="block text-xs">Aviso versão {VERSAO_DO_AVISO}. {consentimentoPositivo(escolha ?? undefined) ? "Medição aceita neste navegador." : "Medição não autorizada neste navegador."}</span>
          </p>
          {erro && <p role="alert" className="erro-campo">Não foi possível guardar sua escolha. A medição continua desligada. Verifique as permissões de armazenamento do navegador.</p>}
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" className="botao-claro" onClick={() => escolher(false)}>Recusar medição</button>
          <button type="button" className="botao-claro" onClick={() => escolher(true)}>Aceitar medição</button>
          {escolha && <button type="button" className="link min-h-11 sm:col-span-2" onClick={() => definirAberto(false)}>Fechar preferências</button>}
        </div>
      </div>
    </section>}
    {escolha && consentimentoPositivo(escolha) && <Suspense fallback={null}><EventosAnalytics consentimento={escolha} /></Suspense>}
  </>;
}
