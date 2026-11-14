import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { apagarCandidaturaAcao, encerrarVagaAcao, marcarCandidaturaVistaAcao } from "@/acoes/vagas";
import { AvisoDaUrl } from "@/components/Avisos";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { exigirUsuario } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { normalizarEndereco } from "@/lib/instagram";
import { seguirEnderecoAntigo } from "@/lib/troca-de-arroba";
import { FORA_DA_BUSCA } from "@/lib/seo";
import { formatarDataCurta, formatarDataHora, formatarTelefone } from "@/lib/texto";
import { AREAS, CONTRATOS, DIAS_MAXIMOS, DIAS_PADRAO, hojeEmBrasilia, rotuloDoValor, somarDias, type Area, type Contrato } from "@/lib/vagas";
import { FormVaga } from "./FormVaga";

export const metadata: Metadata = { title: "Vagas do negócio", robots: FORA_DA_BUSCA };

export default function VagasDoNegocio(props: PageProps<"/painel/[usuario]/vagas">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
      <Suspense fallback={<div className="h-[30rem] animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function situacao(vaga: { status: string; prazo: Date }, agora: Date): string {
  if (vaga.status === "suspensa") return "Suspensa pela moderação";
  if (vaga.status === "encerrada") return "Encerrada";
  return vaga.prazo > agora ? "No ar" : "Prazo encerrado";
}

async function Conteudo({ params, searchParams }: Pick<PageProps<"/painel/[usuario]/vagas">, "params" | "searchParams">) {
  const username = normalizarEndereco((await params).usuario);
  if (!username) notFound();
  const usuario = await exigirUsuario(`/painel/${username}/vagas`);
  const empresa = await db.empresa.findUnique({
    where: { instagramUsername: username },
    include: {
      membros: { select: { usuarioId: true } },
      vagas: { orderBy: { criadoEm: "desc" }, take: 30, include: { candidaturas: { orderBy: { criadoEm: "desc" } } } },
    },
  });
  if (!empresa) await seguirEnderecoAntigo(username, (atual) => `/painel/${atual}/vagas`);
  if (!empresa || !empresa.membros.some((m) => m.usuarioId === usuario.id)) notFound();
  const { aviso } = await searchParams;
  const agora = new Date();
  const hoje = hojeEmBrasilia(agora);
  const publico = empresa.moderacao === "aprovada" && !empresa.oculta;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Link href={`/painel/${empresa.instagramUsername}`} className="text-sm text-suave hover:text-tinta">
          ← {empresa.nome}
        </Link>
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-coral-700 uppercase">Trabalho do bem</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Vagas e candidaturas</h1>
        </div>
        <AvisoDaUrl codigo={aviso} />
      </div>

      {publico ? (
        <FormVaga
          empresaId={empresa.id}
          cidadePadrao={`${empresa.cidade}, ${empresa.uf}`}
          hoje={hoje}
          ultimoDiaPadrao={somarDias(hoje, DIAS_PADRAO)}
          ultimoDiaMaximo={somarDias(hoje, DIAS_MAXIMOS - 1)}
        />
      ) : (
        <p className="cartao p-6 text-suave">Seu negócio precisa estar aprovado e visível no diretório para publicar vagas.</p>
      )}

      <section id="candidaturas" className="scroll-mt-24 space-y-6">
        <h2 className="font-display text-2xl font-semibold">Suas vagas</h2>
        {empresa.vagas.length === 0 && <p className="text-suave">Você ainda não publicou nenhuma vaga.</p>}
        {empresa.vagas.map((vaga) => {
          const aberta = vaga.status === "aberta" && vaga.prazo > agora;
          return (
            <article key={vaga.id} className="cartao space-y-4 p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold">
                    {aberta ? <Link href={`/vagas/${vaga.id}`} className="hover:underline">{vaga.titulo}</Link> : vaga.titulo}
                  </h3>
                  <p className="text-sm text-suave">
                    {situacao(vaga, agora)} · {CONTRATOS[vaga.contrato as Contrato]} · {AREAS[vaga.area as Area]} · {rotuloDoValor(vaga)} · até {formatarDataCurta(vaga.prazo)}
                  </p>
                  {vaga.status === "suspensa" && vaga.motivo && <p className="mt-1 text-sm">Motivo: {vaga.motivo}</p>}
                </div>
                {vaga.status === "aberta" && (
                  <form action={encerrarVagaAcao}>
                    <input type="hidden" name="vagaId" value={vaga.id} />
                    <BotaoEnviar className="botao-claro botao-pequeno" enviando="Encerrando…">Encerrar vaga</BotaoEnviar>
                  </form>
                )}
              </header>

              <h4 className="text-sm font-semibold">
                {vaga.candidaturas.length === 0 ? "Nenhuma candidatura ainda" : `${vaga.candidaturas.length} ${vaga.candidaturas.length === 1 ? "candidatura" : "candidaturas"}`}
              </h4>
              <ul className="space-y-3">
                {vaga.candidaturas.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-linha p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {c.nome} {!c.vistaEm && <span className="ml-1 rounded-full bg-coral-50 px-2 py-0.5 text-xs text-coral-700">Nova</span>}
                      </p>
                      <p className="text-xs text-suave">{formatarDataHora(c.criadoEm)}</p>
                    </div>
                    <p className="mt-1 text-suave">
                      <a className="link" href={`mailto:${c.email}`}>{c.email}</a>
                      {c.whatsapp && <> · <a className="link" href={`https://wa.me/${c.whatsapp}`} rel="noopener noreferrer" target="_blank">{formatarTelefone(c.whatsapp)}</a></>}
                      {c.cidade && <> · {c.cidade}</>}
                    </p>
                    {c.mensagem && <p className="mt-2 whitespace-pre-line">{c.mensagem}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.curriculoChave && (
                        <a href={`/api/curriculos/${c.id}`} target="_blank" rel="noopener noreferrer" className="botao-claro botao-pequeno">
                          Abrir currículo ({c.curriculoNome})
                        </a>
                      )}
                      {c.link && (
                        <a href={c.link} target="_blank" rel="noopener noreferrer nofollow" className="botao-claro botao-pequeno">
                          Abrir link
                        </a>
                      )}
                      <form action={apagarCandidaturaAcao}>
                        <input type="hidden" name="candidaturaId" value={c.id} />
                        <BotaoEnviar className="botao-claro botao-pequeno" enviando="Apagando…">Apagar</BotaoEnviar>
                      </form>
                      {!c.vistaEm && (
                        <form action={marcarCandidaturaVistaAcao}>
                          <input type="hidden" name="candidaturaId" value={c.id} />
                          <BotaoEnviar className="botao-claro botao-pequeno" enviando="Salvando…">Marcar como vista</BotaoEnviar>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>
    </div>
  );
}
