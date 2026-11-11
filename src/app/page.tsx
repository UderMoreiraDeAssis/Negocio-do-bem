import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AbasDoRanking } from "@/components/AbasDoRanking";
import { BuscaDiretorio } from "@/components/BuscaDiretorio";
import { CarrosselDeCidades, type SlideDeCidade } from "@/components/CarrosselDeCidades";
import { Contador } from "@/components/Contador";
import { EmpresaCard, type EmpresaResumo } from "@/components/EmpresaCard";
import { FaixaEmbaixadores } from "@/components/FaixaEmbaixadores";
import { FotoEmpresa } from "@/components/FotoEmpresa";
import { IconeCategoria } from "@/components/IconeCategoria";
import { JsonLd } from "@/components/JsonLd";
import { destaquesDaVitrine, listarCidades, listarLocalidades, maisQueridos, resumoDoDiretorio } from "@/lib/consultas";
import { hrefCidade, hrefDiretorio } from "@/lib/diretorio";
import { CATEGORIAS } from "@/lib/dominio";
import { fotoDaCidade } from "@/lib/fotos-das-cidades";
import { DESCRICAO_DO_SITE, jsonLdDoSite, metadadosDaPagina } from "@/lib/seo";

export const metadata: Metadata = metadadosDaPagina({ descricao: DESCRICAO_DO_SITE, caminho: "/", imagemPropria: true });

const CIDADES_NA_INICIAL = 12;
const CIDADES_COM_FOTO = 4;
const CIDADES_NA_VITRINE = 5;

// Atalhos de "Experimente:": levam direto para o diretório já filtrado.
const ATALHOS = [
  { rotulo: "Café e padaria", href: hrefDiretorio({ tipos: ["Café e padaria"] }) },
  { rotulo: "Liderado por mulheres", href: hrefDiretorio({ causas: ["liderado-por-mulheres"] }) },
  { rotulo: "Opções veganas", href: hrefDiretorio({ causas: ["opcoes-veganas"] }) },
  { rotulo: "Afroempreendedor", href: hrefDiretorio({ causas: ["afroempreendedor"] }) },
  { rotulo: "Pet friendly", href: hrefDiretorio({ causas: ["pet-friendly"] }) },
];

const SETA = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function Inicio() {
  return (
    <>
      <JsonLd dados={jsonLdDoSite()} />
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-6">
          <Suspense fallback={<SeloAoVivo texto="Um movimento do bem, feito pela comunidade" />}>
            <SeloComNumeros />
          </Suspense>
          <h1 className="font-display text-[2.75rem] leading-[0.98] font-bold tracking-[-0.035em] sm:text-7xl">
            Compre de quem <span className="font-serif text-[1.05em] font-medium tracking-[-0.01em] text-coral italic">faz o bem.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-suave sm:text-xl">
            Negócios com consciência social e raízes na comunidade, indicados por quem compra deles.
          </p>
          <Suspense fallback={<BuscaDiretorio cidades={[]} />}>
            <BuscaComCidades />
          </Suspense>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-suave">Experimente:</span>
            {ATALHOS.map((atalho) => (
              <Link key={atalho.rotulo} href={atalho.href} className="rounded-full bg-areia px-3.5 py-1.5 text-sm font-medium transition hover:bg-linha">
                {atalho.rotulo}
              </Link>
            ))}
          </div>
        </div>
        <Suspense fallback={<div className="aspect-[4/3] animate-pulse rounded-[1.75rem] bg-areia sm:aspect-[16/9] lg:aspect-[4/4.4]" aria-busy="true" />}>
          <Vitrine />
        </Suspense>
      </section>

      <Suspense fallback={<div className="mx-auto mt-10 h-28 max-w-6xl px-4 sm:px-6" aria-busy="true" />}>
        <Numeros />
      </Suspense>

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <Cabecalho titulo="Explore por tipo" href="/explorar" link="Ver todos os negócios" />
        <Suspense fallback={<TiposCarregando />}>
          <TiposDeNegocio />
        </Suspense>
      </section>

      <Suspense>
        <OsMaisQueridos />
      </Suspense>

      <Suspense>
        <FaixaEmbaixadores />
      </Suspense>

      <Suspense>
        <CidadesComMaisNegocios />
      </Suspense>

      <ComoFunciona />
    </>
  );
}

function Cabecalho({ titulo, texto, href, link }: { titulo: string; texto?: string; href?: string; link?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-xl">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h2>
        {texto && <p className="mt-2 leading-relaxed text-suave">{texto}</p>}
      </div>
      {href && link && (
        <Link href={href} className="botao-claro">
          {link} {SETA}
        </Link>
      )}
    </div>
  );
}

function SeloAoVivo({ texto }: { texto: string }) {
  return (
    <p className="inline-flex items-center gap-2.5 self-start rounded-full bg-folha-50 py-1.5 pr-3.5 pl-3 text-sm font-semibold text-folha">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-folha ring-4 ring-folha/20" />
      {texto}
    </p>
  );
}

async function SeloComNumeros() {
  const resumo = await resumoDoDiretorio();
  if (resumo.total === 0) return <SeloAoVivo texto="Um movimento do bem, feito pela comunidade" />;
  const negocios = `${resumo.total.toLocaleString("pt-BR")} ${resumo.total === 1 ? "negócio" : "negócios"}`;
  const cidades = `${resumo.cidades.toLocaleString("pt-BR")} ${resumo.cidades === 1 ? "cidade" : "cidades"}`;
  return <SeloAoVivo texto={`${negocios} em ${cidades}`} />;
}

async function BuscaComCidades() {
  const [cidades, localidades] = await Promise.all([listarCidades(), listarLocalidades()]);
  return <BuscaDiretorio cidades={cidades} localidades={localidades} />;
}

/**
 * As fotos das cidades com mais negócios (entre as que têm foto), em carrossel, e por
 * cima dois negócios sorteados a cada visita, com mais chance para os mais queridos
 * (ver destaquesDaVitrine). Sem nenhuma cidade com foto, não aparece.
 */
async function Vitrine() {
  // O sorteio é por pedido: nunca na publicação.
  await connection();
  const [cidades, destaques] = await Promise.all([listarCidades(), destaquesDaVitrine()]);
  const slides: SlideDeCidade[] = [...cidades]
    .sort((a, b) => b.total - a.total)
    .flatMap((c) => {
      const foto = fotoDaCidade(c.cidade, c.uf);
      return foto
        ? [{ cidade: c.cidade, uf: c.uf, total: c.total, href: hrefCidade(c.cidade, c.uf), src: foto.src, srcPequena: foto.srcPequena, largura: foto.largura, alt: foto.alt }]
        : [];
    })
    .slice(0, CIDADES_NA_VITRINE);
  if (slides.length === 0) return null;
  return (
    <div className="relative min-w-0">
      <CarrosselDeCidades cidades={slides} />
      {destaques.map((empresa, i) => (
        <Link
          key={empresa.id}
          href={`/empresas/${empresa.instagramUsername}`}
          className={`absolute flex max-w-64 items-center gap-3 rounded-2xl bg-superficie py-2.5 pr-4 pl-2.5 shadow-flutuante transition hover:-translate-y-0.5 escuro:ring-1 escuro:ring-linha ${
            i === 0 ? "top-4 left-4 lg:top-[9%] lg:left-0" : "top-[40%] -right-3 max-lg:hidden"
          }`}
        >
          <FotoEmpresa empresa={empresa} />
          <span className="min-w-0">
            <span className="line-clamp-2 text-sm leading-tight font-semibold">{empresa.nome}</span>
            <span className="block truncate text-xs text-suave">
              {empresa.categoria} · {empresa.cidade}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

async function Numeros() {
  const resumo = await resumoDoDiretorio();
  const itens = [
    { valor: resumo.total, rotulo: resumo.total === 1 ? "negócio do bem" : "negócios do bem", contar: true },
    { valor: resumo.cidades, rotulo: resumo.cidades === 1 ? "cidade" : "cidades" },
    { valor: resumo.estados, rotulo: resumo.estados === 1 ? "estado" : "estados" },
    { valor: resumo.verificados, rotulo: "perfis assumidos pelos donos" },
  ];
  return (
    <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6" aria-label="O diretório em números">
      <dl className="grid grid-cols-2 border-y border-linha sm:grid-cols-4">
        {itens.map((item, i) => (
          <div
            key={item.rotulo}
            className={`flex flex-col-reverse gap-0.5 border-linha py-5 ${i > 0 ? "sm:border-l sm:pl-6" : ""} ${i % 2 === 1 ? "max-sm:border-l max-sm:pl-5" : ""} ${i >= 2 ? "max-sm:border-t" : ""}`}
          >
            <dt className="text-sm text-suave">{item.rotulo}</dt>
            <dd className="font-display text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
              {item.contar ? <Contador valor={item.valor} /> : item.valor.toLocaleString("pt-BR")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

async function TiposDeNegocio() {
  const { porCategoria } = await resumoDoDiretorio();
  return (
    <div className="-mx-4 mt-6 flex snap-x gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-2 sm:overflow-visible sm:px-0 lg:grid-cols-8">
      {CATEGORIAS.map((categoria) => {
        const total = porCategoria[categoria] ?? 0;
        return (
          <Link
            key={categoria}
            href={hrefDiretorio({ tipos: [categoria] })}
            className={`group flex w-24 shrink-0 snap-start flex-col items-center gap-2.5 rounded-3xl px-1.5 py-4 text-center transition hover:bg-areia sm:w-auto ${total === 0 ? "opacity-55" : ""}`}
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-areia text-tinta transition group-hover:bg-coral group-hover:text-white">
              <IconeCategoria categoria={categoria} className="h-6 w-6" />
            </span>
            <span className="text-[13.5px] leading-tight font-semibold text-balance">{categoria}</span>
            <span className="-mt-1.5 text-xs text-suave">{total === 0 ? "nenhum ainda" : total.toLocaleString("pt-BR")}</span>
          </Link>
        );
      })}
    </div>
  );
}

function TiposCarregando() {
  return (
    <div className="mt-6 grid grid-cols-4 gap-2 lg:grid-cols-8" aria-busy="true">
      {CATEGORIAS.map((categoria) => (
        <div key={categoria} className="h-32 animate-pulse rounded-3xl bg-areia" />
      ))}
    </div>
  );
}

function numeroDe(total: number, um: string, varios: string) {
  return `${total.toLocaleString("pt-BR")} ${total === 1 ? um : varios}`;
}

function ListaDoRanking<T extends EmpresaResumo>({ empresas, numero }: { empresas: T[]; numero: (e: T) => string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {empresas.map((empresa, i) => (
        <EmpresaCard key={empresa.id} empresa={empresa} destaque={{ posicao: i + 1, numero: numero(empresa) }} />
      ))}
    </div>
  );
}

/** "Os mais queridos": quem tem mais favoritos e mais depoimentos. Sem nenhum dos dois, não aparece. */
async function OsMaisQueridos() {
  const { maisFavoritados, maisDepoimentos } = await maisQueridos();
  const abas = [
    maisFavoritados.length > 0 && {
      id: "favoritos",
      rotulo: "Mais favoritados",
      conteudo: <ListaDoRanking empresas={maisFavoritados} numero={(e) => numeroDe(e._count.favoritos, "favorito", "favoritos")} />,
    },
    maisDepoimentos.length > 0 && {
      id: "depoimentos",
      rotulo: "Mais depoimentos",
      conteudo: <ListaDoRanking empresas={maisDepoimentos} numero={(e) => numeroDe(e._count.depoimentos, "depoimento", "depoimentos")} />,
    },
  ].filter((aba) => aba !== false);
  if (abas.length === 0) return null;
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <Cabecalho titulo="Os mais queridos" texto="Os negócios que a comunidade mais favoritou e recomendou." />
      <div className="mt-6">
        <AbasDoRanking abas={abas} />
      </div>
    </section>
  );
}

/** As cidades com mais negócios: as primeiras com foto, as outras em botões. */
async function CidadesComMaisNegocios() {
  const cidades = [...(await listarCidades())]
    .sort((a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR"))
    .slice(0, CIDADES_NA_INICIAL)
    .map((c) => ({ ...c, foto: fotoDaCidade(c.cidade, c.uf) }));
  if (cidades.length === 0) return null;
  const comFoto = cidades.filter((c) => c.foto).slice(0, CIDADES_COM_FOTO);
  const outras = cidades.filter((c) => !comFoto.includes(c));
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <Cabecalho titulo="Explore por cidade" href="/cidades" link="Ver todas as cidades" />
      {comFoto.length > 0 && (
        <div className="-mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0">
          {comFoto.map((cidade) => (
            <Link
              key={`${cidade.cidade}-${cidade.uf}`}
              href={hrefCidade(cidade.cidade, cidade.uf)}
              className="group relative w-[62%] shrink-0 snap-start overflow-hidden rounded-3xl sm:w-auto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cidade.foto!.srcPequena}
                alt=""
                loading="lazy"
                className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 text-white">
                <span className="block font-display text-xl font-bold tracking-tight">{cidade.cidade}</span>
                <span className="text-sm text-white/85">
                  {cidade.uf} · {numeroDe(cidade.total, "negócio", "negócios")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {outras.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {outras.map((cidade) => (
            <Link
              key={`${cidade.cidade}-${cidade.uf}`}
              href={hrefCidade(cidade.cidade, cidade.uf)}
              className="inline-flex items-center gap-2 rounded-full bg-areia px-4 py-2 text-sm font-medium transition hover:bg-linha"
            >
              {cidade.cidade}, {cidade.uf}
              <span className="text-suave tabular-nums">{cidade.total}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ComoFunciona() {
  const passos = [
    { titulo: "A comunidade indica", texto: "Qualquer pessoa indica um negócio pelo @ do Instagram e conta por que ele faz o bem." },
    { titulo: "O dono assume o perfil", texto: "Quem cuida do negócio envia CNPJ, site e contato e passa a contar a própria história." },
    { titulo: "Todo mundo fortalece", texto: "Clientes deixam depoimentos, escolhem pelas causas que importam e espalham a palavra." },
  ];
  return (
    <>
      <section className="mt-24 bg-areia">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <Cabecalho titulo="Como funciona" href="/sobre" link="Saiba mais" />
          <ol className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {passos.map((passo, i) => (
              <li key={passo.titulo} className="flex flex-col gap-2.5">
                <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-tinta font-display text-[15px] font-bold text-papel">
                  {i + 1}
                </span>
                <h3 className="mt-1.5 font-display text-xl font-semibold tracking-tight">{passo.titulo}</h3>
                <p className="leading-relaxed text-suave">{passo.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[1.75rem] bg-tinta px-6 py-10 text-papel sm:flex-row sm:items-center sm:px-12 escuro:bg-superficie escuro:text-tinta escuro:ring-1 escuro:ring-linha">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Tem um negócio do bem?</h2>
            <p className="mt-2 text-papel/70 escuro:text-suave">Cadastre, mostre as causas que você abraça e conte a sua história.</p>
          </div>
          <Link href="/sobre#dono" className="botao-coral shrink-0 px-6 py-3.5 text-base">
            Sou dono de um negócio
          </Link>
        </div>
      </section>
    </>
  );
}
