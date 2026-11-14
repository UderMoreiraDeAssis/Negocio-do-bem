import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { moderarTalentoAcao } from "@/acoes/talentos";
import { moderarVagaAcao } from "@/acoes/vagas";
import { AvisoDaUrl } from "@/components/Avisos";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { exigirModerador } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { formatarDataCurta } from "@/lib/texto";
import { rotuloDoValor } from "@/lib/vagas";

export const metadata: Metadata = { title: "Vagas · Moderação", robots: { index: false } };

export default function ModeracaoDeVagas(props: PageProps<"/moderacao/vagas">) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6">
      <Link href="/moderacao" className="text-sm text-suave hover:text-tinta">← Moderação</Link>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Vagas e talentos</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Pick<PageProps<"/moderacao/vagas">, "searchParams">) {
  await exigirModerador();
  const { aviso } = await searchParams;
  const talentos = await db.talento.findMany({
    orderBy: { atualizadoEm: "desc" },
    take: 100,
    select: { id: true, nome: true, titulo: true, cidade: true, uf: true, aberto: true, status: true, motivo: true, atualizadoEm: true, usuario: { select: { email: true } } },
  });
  const vagas = await db.vaga.findMany({
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: { empresa: { select: { nome: true, instagramUsername: true } }, _count: { select: { candidaturas: true } } },
  });
  return (
    <div className="mt-6 space-y-4">
      <AvisoDaUrl codigo={aviso} />
      {vagas.length === 0 && <p className="text-suave">Nenhuma vaga publicada.</p>}
      {vagas.map((vaga) => (
        <article key={vaga.id} className="cartao space-y-3 p-5">
          <div>
            <h2 className="font-display text-xl font-semibold">
              <Link href={`/vagas/${vaga.id}`} className="hover:underline">{vaga.titulo}</Link>
            </h2>
            <p className="text-sm text-suave">
              {vaga.empresa.nome} (@{vaga.empresa.instagramUsername}) · {vaga.status} · {rotuloDoValor(vaga)} · até {formatarDataCurta(vaga.prazo)} · {vaga._count.candidaturas} candidaturas
            </p>
            {vaga.motivo && <p className="mt-1 text-sm">Motivo: {vaga.motivo}</p>}
          </div>
          <form action={moderarVagaAcao} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="vagaId" value={vaga.id} />
            {vaga.status === "suspensa" ? (
              <BotaoEnviar name="acao" value="reativar" className="botao-claro botao-pequeno">Devolver ao ar</BotaoEnviar>
            ) : (
              <>
                <input name="motivo" required maxLength={300} placeholder="Motivo da suspensão" aria-label="Motivo da suspensão" className="campo max-w-sm" />
                <BotaoEnviar name="acao" value="suspender" className="botao-claro botao-pequeno">Tirar do ar</BotaoEnviar>
              </>
            )}
          </form>
        </article>
      ))}

      <h2 id="talentos" className="pt-8 font-display text-3xl font-semibold tracking-tight">Banco de talentos</h2>
      {talentos.length === 0 && <p className="text-suave">Nenhum perfil de talento.</p>}
      {talentos.map((talento) => (
        <article key={talento.id} className="cartao space-y-3 p-5">
          <div>
            <h3 className="font-display text-xl font-semibold">
              <Link href={`/vagas/talentos/${talento.id}`} className="hover:underline">{talento.nome}</Link>
            </h3>
            <p className="text-sm text-suave">
              {talento.titulo} · {talento.cidade}, {talento.uf} · {talento.usuario.email} · {talento.status === "suspenso" ? "suspenso" : talento.aberto ? "aberto" : "pausado"} · atualizado em {formatarDataCurta(talento.atualizadoEm)}
            </p>
            {talento.motivo && <p className="mt-1 text-sm">Motivo: {talento.motivo}</p>}
          </div>
          <form action={moderarTalentoAcao} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="talentoId" value={talento.id} />
            {talento.status === "suspenso" ? (
              <BotaoEnviar name="acao" value="reativar" className="botao-claro botao-pequeno">Devolver à base</BotaoEnviar>
            ) : (
              <>
                <input name="motivo" required maxLength={300} placeholder="Motivo" aria-label={`Motivo para tirar ${talento.nome} da base`} className="campo max-w-sm" />
                <BotaoEnviar name="acao" value="suspender" className="botao-claro botao-pequeno">Tirar da base</BotaoEnviar>
              </>
            )}
          </form>
        </article>
      ))}
    </div>
  );
}
