import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { moderarTalentoAcao } from "@/acoes/talentos";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Monograma } from "@/components/Monograma";
import { usuarioAtual } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { FORA_DA_BUSCA } from "@/lib/seo";
import { podeVerContatosDeTalentos } from "@/lib/talentos";
import { formatarDataCurta, formatarTelefone } from "@/lib/texto";
import { AREAS, CONTRATOS, MODALIDADES, type Area, type Contrato, type Modalidade } from "@/lib/vagas-rotulos";

export const metadata: Metadata = { title: "Talento", robots: FORA_DA_BUSCA };

export default function PaginaDoTalento(props: PageProps<"/vagas/talentos/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo params={props.params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: Pick<PageProps<"/vagas/talentos/[id]">, "params">) {
  const { id } = await params;
  const [talento, usuario] = await Promise.all([db.talento.findUnique({ where: { id } }), usuarioAtual()]);
  if (!talento) notFound();
  const propria = usuario?.id === talento.usuarioId;
  const publico = talento.aberto && talento.status === "ativo";
  // Pausado ou suspenso, só a própria pessoa e a moderação veem.
  if (!publico && !propria && !usuario?.moderador) notFound();
  const veContatos = propria || (await podeVerContatosDeTalentos(usuario));

  const listas: [string, string[]][] = [
    ["Áreas", talento.areas.map((a) => AREAS[a as Area]).filter(Boolean)],
    ["Contratação", talento.contratos.map((c) => CONTRATOS[c as Contrato]).filter(Boolean)],
    ["Modalidade", talento.modalidades.map((m) => MODALIDADES[m as Modalidade]).filter(Boolean)],
  ];

  return (
    <>
      <nav aria-label="Você está em" className="text-sm text-suave">
        <Link href="/vagas/talentos" className="hover:text-tinta">
          ← Banco de talentos
        </Link>
      </nav>

      {propria && (
        <div className="cartao mt-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <p>{publico ? "É assim que os negócios veem seu perfil." : "Seu perfil não está na base agora: só você vê esta página."}</p>
          <Link href="/vagas/talentos/meu-perfil" className="botao-claro botao-pequeno">
            Editar perfil
          </Link>
        </div>
      )}

      <header className="mt-6 flex items-start gap-4">
        <Monograma nome={talento.nome} chave={talento.id} tamanho="lg" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{talento.nome}</h1>
          <p className="mt-1 text-lg text-suave">{talento.titulo}</p>
          <p className="mt-2 text-sm font-medium text-coral-700">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" aria-hidden="true" />
            {publico ? "Aberto a trabalho" : talento.status === "suspenso" ? "Fora da base (moderação)" : "Pausado"} · {talento.cidade}, {talento.uf}
          </p>
        </div>
      </header>

      <section className="mt-8 space-y-6 leading-relaxed">
        <div>
          <h2 className="font-display text-xl font-semibold">Habilidades</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm font-medium">
            {talento.habilidades.map((habilidade) => (
              <li key={habilidade} className="rounded-full bg-coral-50 px-3 py-1 text-coral-700">
                {habilidade}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Sobre</h2>
          <p className="mt-2 whitespace-pre-line">{talento.sobre}</p>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">O que procura</h2>
          <p className="mt-2 whitespace-pre-line">{talento.procura}</p>
          <dl className="cartao mt-4 grid gap-4 p-5 text-sm sm:grid-cols-3">
            {listas.map(([nome, valores]) => (
              <div key={nome}>
                <dt className="text-xs font-semibold tracking-wide text-suave uppercase">{nome}</dt>
                <dd className="mt-0.5 font-medium">{valores.join(", ")}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="titulo-contato" className="cartao mt-10 p-6">
        <h2 id="titulo-contato" className="font-display text-xl font-semibold">
          Contato e currículo
        </h2>
        {veContatos ? (
          <div className="mt-3 space-y-3">
            <ul className="space-y-1.5 text-sm">
              <li>
                E-mail:{" "}
                <a href={`mailto:${talento.email}`} className="link">
                  {talento.email}
                </a>
              </li>
              {talento.whatsapp && (
                <li>
                  WhatsApp:{" "}
                  <a href={`https://wa.me/${talento.whatsapp}`} className="link" target="_blank" rel="noopener noreferrer">
                    {formatarTelefone(talento.whatsapp)}
                  </a>
                </li>
              )}
              {talento.link && (
                <li>
                  Link:{" "}
                  <a href={talento.link} className="link break-all" target="_blank" rel="noopener noreferrer nofollow">
                    {talento.link}
                  </a>
                </li>
              )}
            </ul>
            {talento.curriculoChave && (
              <a href={`/api/talentos/${talento.id}/curriculo`} className="botao">
                Baixar currículo
              </a>
            )}
            {!propria && (
              <p className="text-xs text-suave">
                Use estes dados só para falar sobre trabalho com esta pessoa. Não repasse a ninguém. Cada download do currículo fica registrado.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-3 text-sm text-suave">
            <p>Para proteger quem procura trabalho, o contato e o currículo aparecem só para quem tem um negócio no diretório.</p>
            {usuario ? (
              <Link href="/participar" className="botao-claro">
                Cadastrar meu negócio
              </Link>
            ) : (
              <Link href={`/entrar?voltar=${encodeURIComponent(`/vagas/talentos/${talento.id}`)}`} className="botao-claro">
                Entrar
              </Link>
            )}
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-suave">Perfil atualizado em {formatarDataCurta(talento.atualizadoEm)}.</p>

      {usuario?.moderador && (
        <section className="cartao mt-6 space-y-3 p-5">
          <h2 className="font-semibold">Moderação</h2>
          {talento.motivo && <p className="text-sm">Motivo: {talento.motivo}</p>}
          <form action={moderarTalentoAcao} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="talentoId" value={talento.id} />
            {talento.status === "suspenso" ? (
              <BotaoEnviar name="acao" value="reativar" className="botao-claro botao-pequeno">
                Devolver à base
              </BotaoEnviar>
            ) : (
              <>
                <input name="motivo" required maxLength={300} placeholder="Motivo" aria-label="Motivo" className="campo max-w-sm" />
                <BotaoEnviar name="acao" value="suspender" className="botao-claro botao-pequeno">
                  Tirar da base
                </BotaoEnviar>
              </>
            )}
          </form>
        </section>
      )}
    </>
  );
}
