"use client";

import { useActionState, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { candidatarAcao } from "@/acoes/vagas";
import { Aviso } from "@/components/Aviso";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Campo } from "@/components/Campo";
import { enviarSemLimpar } from "@/components/envio";

// A candidatura em três etapas: dados, currículo e mensagem. Todas ficam montadas no mesmo
// formulário e só a atual aparece, então voltar não perde nada (nem o arquivo escolhido). O
// servidor valida tudo de novo e leva a pessoa de volta à etapa do campo com erro. Sem
// JavaScript, as três etapas aparecem juntas e o formulário envia do mesmo jeito.

const ETAPAS = ["Seus dados", "Currículo", "Mensagem e envio"] as const;
const ETAPA_DO_CAMPO: Record<string, number> = { nome: 0, email: 0, whatsapp: 0, cidade: 0, curriculo: 1, link: 1, mensagem: 2, consentimento: 2 };
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export function CandidaturaPorEtapas({ vagaId, titulo, empresa, contaNome, contaEmail }: { vagaId: string; titulo: string; empresa: string; contaNome: string; contaEmail: string }) {
  const [estado, acao, pendente] = useActionState(candidatarAcao, undefined);
  const [etapa, setEtapa] = useState(0);
  // Falso no servidor e na hidratação, verdadeiro depois: sem JavaScript, todas as etapas aparecem.
  const comJs = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [estadoVisto, setEstadoVisto] = useState(estado);
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  const [arquivo, setArquivo] = useState<string>("");
  const formulario = useRef<HTMLFormElement>(null);
  const titulos = useRef<HTMLLegendElement>(null);

  // Um erro do servidor leva à primeira etapa com problema.
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    const campos = Object.keys(estado?.erros ?? {});
    if (campos.length) setEtapa(Math.min(...campos.map((c) => ETAPA_DO_CAMPO[c] ?? 0)));
  }

  const valor = (campo: string, padrao = "") => {
    const enviado = estado?.valores?.[campo];
    return typeof enviado === "string" ? enviado : padrao;
  };
  const erro = (campo: string) => avisos[campo] ?? estado?.erros?.[campo];
  const mostra = (i: number) => !comJs || etapa === i;
  const ler = (nome: string) => String(new FormData(formulario.current!).get(nome) ?? "").trim();

  /** Confere a etapa atual antes de avançar. O servidor confere tudo de novo no envio. */
  function conferir(i: number): boolean {
    const novos: Record<string, string> = {};
    if (i === 0) {
      if (ler("nome").length < 3) novos.nome = "Escreva seu nome completo.";
      if (!/^\S+@\S+\.\S+$/.test(ler("email"))) novos.email = "Digite um e-mail válido.";
    }
    if (i === 1) {
      const file = (formulario.current!.elements.namedItem("curriculo") as HTMLInputElement).files?.[0];
      if (file && file.size > TAMANHO_MAXIMO) novos.curriculo = "O currículo pode ter até 5 MB.";
      else if (!file && !ler("link")) novos.curriculo = "Anexe o currículo ou informe o link dele ou do seu LinkedIn.";
    }
    setAvisos(novos);
    return Object.keys(novos).length === 0;
  }

  function ir(para: number) {
    setEtapa(para);
    titulos.current?.focus();
  }

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    // Se o JavaScript carregou, confere cada etapa antes de enviar.
    for (let i = 0; i < 2; i++) {
      if (!conferir(i)) {
        evento.preventDefault();
        setEtapa(i);
        return;
      }
    }
    enviarSemLimpar(acao)(evento);
  }

  return (
    <section aria-labelledby="titulo-candidatura" id="candidatar" className="cartao p-6 sm:p-8">
      <h2 id="titulo-candidatura" className="font-display text-2xl font-semibold">
        Candidatar-se
      </h2>
      <p className="mt-1 text-sm text-suave">Seus dados vão só para {empresa}. Leva cerca de dois minutos.</p>

      {comJs && (
        <ol className="mt-5 flex items-center gap-2 text-xs font-medium" aria-label="Etapas">
          {ETAPAS.map((nome, i) => (
            <li key={nome} aria-current={i === etapa ? "step" : undefined} className="flex flex-1 items-center gap-2">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${i <= etapa ? "bg-coral text-white" : "bg-areia text-suave"}`}>{i + 1}</span>
              <span className={`hidden sm:inline ${i === etapa ? "text-tinta" : "text-suave"}`}>{nome}</span>
              {i < ETAPAS.length - 1 && <span aria-hidden="true" className={`h-px flex-1 ${i < etapa ? "bg-coral" : "bg-linha"}`} />}
            </li>
          ))}
        </ol>
      )}

      <form ref={formulario} action={acao} onSubmit={aoEnviar} className="mt-6 space-y-5" noValidate>
        <input type="hidden" name="vagaId" value={vagaId} />
        {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

        <fieldset hidden={!mostra(0)} className="space-y-4">
          <legend ref={titulos} tabIndex={-1} className="mb-2 font-display text-lg font-semibold outline-none">
            1. Seus dados
          </legend>
          <Campo id="nome" rotulo="Nome completo" erro={erro("nome")}>
            <input id="nome" name="nome" autoComplete="name" defaultValue={valor("nome", contaNome)} required maxLength={120} className="campo" />
          </Campo>
          <Campo id="email" rotulo="E-mail" erro={erro("email")} ajuda="A empresa responde neste e-mail.">
            <input id="email" name="email" type="email" autoComplete="email" defaultValue={valor("email", contaEmail)} required maxLength={200} className="campo" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="whatsapp" rotulo="WhatsApp (opcional)" erro={erro("whatsapp")}>
              <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" defaultValue={valor("whatsapp")} placeholder="(11) 99148-8052" className="campo" />
            </Campo>
            <Campo id="cidade" rotulo="Cidade (opcional)" erro={erro("cidade")}>
              <input id="cidade" name="cidade" autoComplete="address-level2" defaultValue={valor("cidade")} maxLength={80} className="campo" />
            </Campo>
          </div>
        </fieldset>

        <fieldset hidden={!mostra(1)} className="space-y-4">
          <legend tabIndex={-1} className="mb-2 font-display text-lg font-semibold outline-none">
            2. Currículo
          </legend>
          <Campo id="curriculo" rotulo="Currículo em PDF ou Word" erro={erro("curriculo")} ajuda={arquivo ? `Escolhido: ${arquivo}` : "Até 5 MB. Só a empresa da vaga vê."}>
            <input
              id="curriculo"
              name="curriculo"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? "")}
              className="campo file:mr-3 file:rounded-full file:border-0 file:bg-areia file:px-3 file:py-1 file:text-sm file:font-semibold"
            />
          </Campo>
          <Campo id="link" rotulo="Ou o link do currículo ou do LinkedIn" erro={erro("link")}>
            <input id="link" name="link" inputMode="url" autoComplete="url" defaultValue={valor("link")} placeholder="linkedin.com/in/seunome" maxLength={300} className="campo" />
          </Campo>
        </fieldset>

        <fieldset hidden={!mostra(2)} className="space-y-4">
          <legend tabIndex={-1} className="mb-2 font-display text-lg font-semibold outline-none">
            3. Mensagem e envio
          </legend>
          <Campo id="mensagem" rotulo="Mensagem para a empresa (opcional)" erro={erro("mensagem")} ajuda={`Conte por que você é a pessoa para "${titulo}".`}>
            <textarea id="mensagem" name="mensagem" rows={5} maxLength={1000} defaultValue={valor("mensagem")} className="campo" />
          </Campo>
          <div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="consentimento" value="sim" defaultChecked={valor("consentimento") === "sim"} className="mt-1 h-4 w-4 accent-coral" required />
              <span>
                Autorizo enviar meus dados e currículo para {empresa}, só para esta vaga. A empresa não pode usá-los para outra finalidade, e eu posso pedir para apagá-los.
              </span>
            </label>
            {erro("consentimento") && <p className="erro-campo">{erro("consentimento")}</p>}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {comJs && etapa > 0 ? (
            <button type="button" className="botao-claro" onClick={() => ir(etapa - 1)}>
              Voltar
            </button>
          ) : (
            <span />
          )}
          {comJs && etapa < ETAPAS.length - 1 ? (
            <button type="button" className="botao-coral" onClick={() => conferir(etapa) && ir(etapa + 1)}>
              Continuar
            </button>
          ) : (
            <BotaoEnviar pendente={pendente} className="botao-coral" enviando="Enviando…">
              Enviar candidatura
            </BotaoEnviar>
          )}
        </div>
      </form>
    </section>
  );
}
