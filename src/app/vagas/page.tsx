import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AbasDeVagas } from "@/components/AbasDeVagas";
import { AvisoDaUrl } from "@/components/Avisos";
import { Paginacao } from "@/components/Paginacao";
import { SeletorDeFiltro } from "@/components/SeletorDeFiltro";
import { VagaCard } from "@/components/VagaCard";
import { db } from "@/lib/db";
import { UFS } from "@/lib/dominio";
import { metadadosDaPagina } from "@/lib/seo";
import {
  AREAS,
  condicaoDeFiltros,
  CONTRATOS,
  filtrosDaUrl,
  MODALIDADES,
  VAGAS_POR_PAGINA,
  type FiltrosDeVagas,
} from "@/lib/vagas";

export const metadata: Metadata = metadadosDaPagina({
  titulo: "Vagas em negócios do bem",
  descricao:
    "Vagas, estágios, freelas e bicos em negócios do diretório. Toda vaga mostra o valor, tem contratação dentro da lei e seleção sem discriminação.",
  caminho: "/vagas",
});

export default function Vagas(props: PageProps<"/vagas">) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      <p className="text-xs font-semibold tracking-[0.2em] text-coral-700 uppercase">Trabalho do bem</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Vagas em negócios do bem</h1>
      <p className="mt-3 max-w-2xl text-suave">
        Toda vaga mostra o valor, tem contratação dentro da lei e seleção sem discriminação. Você se candidata aqui mesmo, e seus dados vão só
        para a empresa da vaga.
      </p>
      <AbasDeVagas ativa="vagas" />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function enderecoDaPagina(filtros: FiltrosDeVagas, pagina: number): string {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) if (valor) parametros.set(chave, valor);
  if (pagina > 1) parametros.set("pagina", String(pagina));
  const texto = parametros.toString();
  return texto ? `/vagas?${texto}` : "/vagas";
}

async function Conteudo({ searchParams }: Pick<PageProps<"/vagas">, "searchParams">) {
  // A hora atual (o prazo das vagas) só depois de um acesso dinâmico: o Cache Components não deixa antes.
  await connection();
  const parametros = await searchParams;
  const filtros = filtrosDaUrl(parametros);
  const pedida = Number(Array.isArray(parametros.pagina) ? parametros.pagina[0] : parametros.pagina);
  const onde = condicaoDeFiltros(filtros);
  const [total, ufs] = await Promise.all([
    db.vaga.count({ where: onde }),
    db.vaga.findMany({ where: condicaoDeFiltros({}), distinct: ["uf"], select: { uf: true }, orderBy: { uf: "asc" } }),
  ]);
  const paginas = Math.max(1, Math.ceil(total / VAGAS_POR_PAGINA));
  const pagina = Number.isInteger(pedida) && pedida >= 1 ? Math.min(pedida, paginas) : 1;
  const vagas = await db.vaga.findMany({
    where: onde,
    orderBy: { criadoEm: "desc" },
    skip: (pagina - 1) * VAGAS_POR_PAGINA,
    take: VAGAS_POR_PAGINA,
    include: { empresa: { select: { nome: true, instagramUsername: true, fotoUrl: true } } },
  });
  const temFiltro = Object.values(filtros).some(Boolean);
  const ufsComVaga = ufs.map((v) => v.uf).filter((uf) => (UFS as readonly string[]).includes(uf));

  return (
    <>
      <div className="mt-6">
        <AvisoDaUrl codigo={parametros.aviso} />
      </div>
      {/* Um formulário GET comum: filtra sem JavaScript e a URL pode ser compartilhada. */}
      <form action="/vagas" className="cartao mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-5">
          <label htmlFor="busca" className="rotulo">
            Cargo, empresa ou cidade
          </label>
          <input id="busca" name="busca" defaultValue={filtros.busca} maxLength={80} className="campo" placeholder="Ex.: atendente, padaria, Recife" />
        </div>
        <SeletorDeFiltro id="area" rotulo="Área" valor={filtros.area} opcoes={Object.entries(AREAS)} vazio="Todas as áreas" />
        <SeletorDeFiltro id="contrato" rotulo="Contratação" valor={filtros.contrato} opcoes={Object.entries(CONTRATOS)} vazio="Qualquer tipo" />
        <SeletorDeFiltro id="modalidade" rotulo="Modalidade" valor={filtros.modalidade} opcoes={Object.entries(MODALIDADES)} vazio="Qualquer modalidade" />
        <SeletorDeFiltro id="uf" rotulo="Estado" valor={filtros.uf} opcoes={ufsComVaga.map((uf) => [uf, uf])} vazio="Todos os estados" />
        <div className="flex items-end gap-2">
          <button type="submit" className="botao flex-1">
            Filtrar
          </button>
          {temFiltro && (
            <Link href="/vagas" className="botao-claro">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <p className="mt-6 text-sm text-suave" aria-live="polite">
        {total === 0 ? "Nenhuma vaga encontrada." : `${total} ${total === 1 ? "vaga aberta" : "vagas abertas"}`}
      </p>
      {total === 0 ? (
        <div className="cartao mt-4 p-8 text-center">
          <p className="font-display text-xl font-semibold">{temFiltro ? "Nada com esses filtros" : "Ainda não há vagas abertas"}</p>
          <p className="mt-2 text-suave">
            {temFiltro ? "Tire um filtro ou volte depois." : "Quando um negócio do diretório publicar uma vaga, ela aparece aqui."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4">
          {vagas.map((vaga) => (
            <VagaCard key={vaga.id} vaga={vaga} />
          ))}
        </ul>
      )}
      <Paginacao atual={pagina} total={paginas} href={(p) => enderecoDaPagina(filtros, p)} />

      <section className="cartao mt-12 p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">Procurando trabalho?</h2>
        <p className="mt-2 text-suave">
          Entre no banco de talentos: conte o que você sabe fazer e o que procura, e os negócios do diretório chegam até você, mesmo antes de abrir uma vaga.
        </p>
        <Link href="/vagas/talentos/meu-perfil" className="botao-coral mt-4">
          Estou aberto a trabalho
        </Link>
      </section>

      <section className="cartao mt-4 p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">Tem um negócio e precisa de gente?</h2>
        <p className="mt-2 text-suave">Quem é dono de um negócio do diretório publica vagas de graça, no painel, e recebe as candidaturas por aqui.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/painel" className="botao">
            Publicar uma vaga
          </Link>
          <Link href="/vagas/talentos" className="botao-claro">
            Ver o banco de talentos
          </Link>
        </div>
      </section>
    </>
  );
}
