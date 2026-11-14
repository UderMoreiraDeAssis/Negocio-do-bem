import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AvisoDaUrl } from "@/components/Avisos";
import { FotoEmpresa } from "@/components/FotoEmpresa";
import { JsonLd } from "@/components/JsonLd";
import { Prazo } from "@/components/Prazo";
import { usuarioAtual } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { ehFotoDoSite } from "@/lib/fotos";
import { ENDERECO_DO_SITE, metadadosDaPagina, urlAbsoluta } from "@/lib/seo";
import { AREAS, condicaoDeVagaPublica, CONTRATOS, MODALIDADES, rotuloDoValor, type Area, type Contrato, type Modalidade } from "@/lib/vagas";
import { CandidaturaPorEtapas } from "./CandidaturaPorEtapas";

const TIPO_NO_GOOGLE: Record<string, string> = { clt: "FULL_TIME", pj: "CONTRACTOR", estagio: "INTERN", temporario: "TEMPORARY", freela: "CONTRACTOR", bico: "OTHER" };
const UNIDADE_NO_GOOGLE: Record<string, string> = { mes: "MONTH", hora: "HOUR", dia: "DAY" };

async function buscar(id: string) {
  // A hora atual só depois de um acesso dinâmico: o Cache Components não deixa antes.
  await connection();
  return db.vaga.findFirst({
    where: { id, ...condicaoDeVagaPublica() },
    include: { empresa: { select: { id: true, nome: true, instagramUsername: true, fotoUrl: true, cidade: true, uf: true } } },
  });
}

export async function generateMetadata(props: PageProps<"/vagas/[id]">): Promise<Metadata> {
  const vaga = await buscar((await props.params).id);
  if (!vaga) return { title: "Vaga não encontrada", robots: { index: false } };
  return metadadosDaPagina({
    titulo: `${vaga.titulo} · ${vaga.empresa.nome}`,
    descricao: `${vaga.titulo} em ${vaga.empresa.nome}, ${vaga.cidade}, ${vaga.uf}. ${rotuloDoValor(vaga)}. Candidate-se pelo Negócio do Bem.`,
    caminho: `/vagas/${vaga.id}`,
  });
}

export default function PaginaDaVaga(props: PageProps<"/vagas/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params, searchParams }: Pick<PageProps<"/vagas/[id]">, "params" | "searchParams">) {
  const vaga = await buscar((await params).id);
  if (!vaga) notFound();
  const { aviso } = await searchParams;
  const usuario = await usuarioAtual();
  const dono = usuario ? (await db.empresaMembro.count({ where: { empresaId: vaga.empresaId, usuarioId: usuario.id } })) > 0 : false;
  const candidatou = aviso === "candidatura_enviada";

  const dadosEstruturados = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: vaga.titulo,
    description: `${vaga.descricao}\n\nRequisitos: ${vaga.requisitos}${vaga.beneficios ? `\n\nBenefícios: ${vaga.beneficios}` : ""}`,
    datePosted: vaga.criadoEm.toISOString(),
    validThrough: vaga.prazo.toISOString(),
    employmentType: TIPO_NO_GOOGLE[vaga.contrato],
    directApply: true,
    hiringOrganization: {
      "@type": "Organization",
      name: vaga.empresa.nome,
      sameAs: `${ENDERECO_DO_SITE}/empresas/${vaga.empresa.instagramUsername}`,
      ...(ehFotoDoSite(vaga.empresa.fotoUrl) && { logo: urlAbsoluta(vaga.empresa.fotoUrl) }),
    },
    ...(vaga.modalidade === "remoto" && { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "BR" } }),
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: vaga.cidade, addressRegion: vaga.uf, addressCountry: "BR" } },
    ...(UNIDADE_NO_GOOGLE[vaga.valorPeriodo] && {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "BRL",
        value: {
          "@type": "QuantitativeValue",
          minValue: vaga.valorMin,
          ...(vaga.valorMax && { maxValue: vaga.valorMax }),
          unitText: UNIDADE_NO_GOOGLE[vaga.valorPeriodo],
        },
      },
    }),
  };

  return (
    <>
      <JsonLd dados={dadosEstruturados} />
      <nav aria-label="Você está em" className="text-sm text-suave">
        <Link href="/vagas" className="hover:text-tinta">
          ← Todas as vagas
        </Link>
      </nav>
      <div className="mt-4">
        <AvisoDaUrl codigo={aviso} />
      </div>
      <header className="mt-4 flex items-start gap-4">
        <FotoEmpresa empresa={vaga.empresa} tamanho="lg" />
        <div className="min-w-0">
          <Link href={`/empresas/${vaga.empresa.instagramUsername}`} className="link text-sm">
            {vaga.empresa.nome}
          </Link>
          <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{vaga.titulo}</h1>
          <p className="mt-1 text-lg font-semibold text-coral-700">{rotuloDoValor(vaga)}</p>
        </div>
      </header>

      <dl className="cartao mt-6 grid gap-4 p-5 text-sm sm:grid-cols-2">
        {[
          ["Contratação", CONTRATOS[vaga.contrato as Contrato]],
          ["Modalidade", MODALIDADES[vaga.modalidade as Modalidade]],
          ["Área", AREAS[vaga.area as Area]],
          ["Local", `${vaga.cidade}, ${vaga.uf}`],
          ["Jornada ou prazo", vaga.jornada],
        ].map(([nome, valor]) => (
          <div key={nome}>
            <dt className="text-xs font-semibold tracking-wide text-suave uppercase">{nome}</dt>
            <dd className="mt-0.5 font-medium">{valor}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs font-semibold tracking-wide text-suave uppercase">Candidaturas até</dt>
          <dd className="mt-0.5 font-medium">
            <Prazo fim={vaga.prazo.toISOString()} />
          </dd>
        </div>
      </dl>

      <section className="mt-8 space-y-6 leading-relaxed">
        <div>
          <h2 className="font-display text-xl font-semibold">O que a pessoa vai fazer</h2>
          <p className="mt-2 whitespace-pre-line">{vaga.descricao}</p>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Requisitos</h2>
          <p className="mt-2 whitespace-pre-line">{vaga.requisitos}</p>
        </div>
        {vaga.beneficios && (
          <div>
            <h2 className="font-display text-xl font-semibold">Benefícios</h2>
            <p className="mt-2 whitespace-pre-line">{vaga.beneficios}</p>
          </div>
        )}
      </section>

      <div className="mt-10">
        {dono ? (
          <div className="cartao p-6">
            <p className="font-semibold">Esta é a vaga do seu negócio.</p>
            <Link href={`/painel/${vaga.empresa.instagramUsername}/vagas`} className="botao mt-3">
              Ver candidaturas
            </Link>
          </div>
        ) : candidatou ? (
          <div className="cartao p-6">
            <p className="font-display text-xl font-semibold">Candidatura enviada</p>
            <p className="mt-1 text-suave">A empresa recebeu seus dados e entra em contato se seguir com você.</p>
          </div>
        ) : (
          <CandidaturaPorEtapas
            vagaId={vaga.id}
            titulo={vaga.titulo}
            empresa={vaga.empresa.nome}
            contaNome={usuario?.nome ?? ""}
            contaEmail={usuario?.email ?? ""}
          />
        )}
      </div>

      <p className="mt-8 text-xs text-suave">
        Algo errado nesta vaga? Valor que não confere, exigência discriminatória ou golpe: avise a moderação pelo e-mail do rodapé do site.
      </p>
    </>
  );
}
