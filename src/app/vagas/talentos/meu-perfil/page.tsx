import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { alternarAbertoAcao, apagarTalentoAcao } from "@/acoes/talentos";
import { AvisoDaUrl } from "@/components/Avisos";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { exigirUsuario } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { FORA_DA_BUSCA } from "@/lib/seo";
import { formatarMunicipio, formatarTelefone } from "@/lib/texto";
import { FormTalento } from "./FormTalento";

export const metadata: Metadata = { title: "Meu perfil de talento", robots: FORA_DA_BUSCA };

export default function MeuPerfilDeTalento(props: PageProps<"/vagas/talentos/meu-perfil">) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-12">
      <nav aria-label="Você está em" className="text-sm text-suave">
        <Link href="/vagas/talentos" className="hover:text-tinta">
          ← Banco de talentos
        </Link>
      </nav>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Pick<PageProps<"/vagas/talentos/meu-perfil">, "searchParams">) {
  const usuario = await exigirUsuario("/vagas/talentos/meu-perfil");
  const [{ aviso }, talento] = await Promise.all([searchParams, db.talento.findUnique({ where: { usuarioId: usuario.id } })]);

  return (
    <>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{talento ? "Meu perfil de talento" : "Estou aberto a trabalho"}</h1>
      <p className="mt-3 text-suave">
        {talento
          ? "Mantenha seu perfil em dia: os negócios veem primeiro quem atualizou por último."
          : "Conte o que você sabe fazer e o que procura. Você aparece no banco de talentos, e os negócios do diretório chamam você para conversar."}
      </p>
      <div className="mt-6 space-y-6">
        <AvisoDaUrl codigo={aviso} />

        {talento?.status === "suspenso" && (
          <div className="cartao border-coral p-5 text-sm">
            <p className="font-semibold">A moderação tirou seu perfil da base.</p>
            {talento.motivo && <p className="mt-1">Motivo: {talento.motivo}</p>}
            <p className="mt-1 text-suave">Ajuste o que foi apontado e fale com a moderação pelo e-mail do rodapé do site.</p>
          </div>
        )}

        {talento && (
          <div className="cartao flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${talento.aberto ? "bg-emerald-500" : "bg-linha"}`} aria-hidden="true" />
                {talento.aberto ? "Aberto a trabalho" : "Pausado"}
              </p>
              <p className="text-sm text-suave">{talento.aberto ? "Você aparece na base de talentos." : "Você não aparece na base."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/vagas/talentos/${talento.id}`} className="botao-claro botao-pequeno">
                Ver como fica
              </Link>
              <form action={alternarAbertoAcao}>
                <input type="hidden" name="aberto" value={talento.aberto ? "nao" : "sim"} />
                <BotaoEnviar className={talento.aberto ? "botao-claro botao-pequeno" : "botao-coral botao-pequeno"}>
                  {talento.aberto ? "Pausar" : "Voltar à base"}
                </BotaoEnviar>
              </form>
            </div>
          </div>
        )}

        {!usuario.emailConfirmado && (
          <div className="cartao p-5 text-sm">Antes de entrar na base, confirme seu e-mail: abra o link que mandamos ou peça outro no seu painel.</div>
        )}

        <FormTalento
          salvo={{
            nome: talento?.nome ?? usuario.nome,
            titulo: talento?.titulo ?? "",
            sobre: talento?.sobre ?? "",
            procura: talento?.procura ?? "",
            habilidades: talento?.habilidades ?? [],
            areas: talento?.areas ?? [],
            contratos: talento?.contratos ?? [],
            modalidades: talento?.modalidades ?? [],
            municipio: talento ? formatarMunicipio(talento.cidade, talento.uf) : "",
            email: talento?.email ?? usuario.email,
            whatsapp: talento?.whatsapp ? formatarTelefone(talento.whatsapp) : "",
            link: talento?.link ?? "",
            aberto: talento?.aberto ?? true,
            curriculoNome: talento?.curriculoNome ?? null,
          }}
        />

        {talento && (
          <details className="cartao p-5 text-sm">
            <summary className="cursor-pointer font-semibold">Apagar meu perfil</summary>
            <p className="mt-2 text-suave">Apaga o perfil e o currículo de vez. As candidaturas que você já enviou para vagas continuam com as empresas.</p>
            <form action={apagarTalentoAcao} className="mt-3">
              <BotaoEnviar className="botao-claro botao-pequeno text-coral-700">Apagar perfil e currículo</BotaoEnviar>
            </form>
          </details>
        )}
      </div>
    </>
  );
}
