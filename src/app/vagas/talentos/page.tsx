import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AbasDeVagas } from "@/components/AbasDeVagas";
import { AvisoDaUrl } from "@/components/Avisos";
import { Paginacao } from "@/components/Paginacao";
import { SeletorDeFiltro } from "@/components/SeletorDeFiltro";
import { TalentoCard } from "@/components/TalentoCard";
import { usuarioAtual } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { UFS } from "@/lib/dominio";
import { FORA_DA_BUSCA } from "@/lib/seo";
import {
  condicaoDeFiltrosDeTalentos,
  condicaoDeTalentoPublico,
  filtrosDeTalentosDaUrl,
  podeVerContatosDeTalentos,
  TALENTOS_POR_PAGINA,
  type FiltrosDeTalentos,
} from "@/lib/talentos";
import { AREAS, CONTRATOS, MODALIDADES } from "@/lib/vagas-rotulos";

// Fora do Google: são pessoas, não negócios. Quem procura trabalho aparece para quem visita o site.
export const metadata: Metadata = {
  title: "Banco de talentos",
  description: "Pessoas abertas a trabalho em negócios do bem: o que sabem fazer, o que procuram e onde estão.",
  robots: FORA_DA_BUSCA,
};

export default function Talentos(props: PageProps<"/vagas/talentos">) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      <p className="text-xs font-semibold tracking-[0.2em] text-coral-700 uppercase">Trabalho do bem</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Banco de talentos</h1>
      <p className="mt-3 max-w-2xl text-suave">
        Gente aberta a trabalho, com o que sabe fazer e o que procura. Quem tem um negócio no diretório vê o contato e o currículo e chama para
        conversar.
      </p>
      <AbasDeVagas ativa="talentos" />
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-3xl bg-superficie" />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function enderecoDaPagina(filtros: FiltrosDeTalentos, pagina: number): string {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) if (valor) parametros.set(chave, valor);
  if (pagina > 1) parametros.set("pagina", String(pagina));
  const texto = parametros.toString();
  return texto ? `/vagas/talentos?${texto}` : "/vagas/talentos";
}

async function Conteudo({ searchParams }: Pick<PageProps<"/vagas/talentos">, "searchParams">) {
  const parametros = await searchParams;
  const filtros = filtrosDeTalentosDaUrl(parametros);
  const pedida = Number(Array.isArray(parametros.pagina) ? parametros.pagina[0] : parametros.pagina);
  const onde = condicaoDeFiltrosDeTalentos(filtros);
  const usuario = await usuarioAtual();
  const [total, ufs, meu, veContatos] = await Promise.all([
    db.talento.count({ where: onde }),
    db.talento.findMany({ where: condicaoDeTalentoPublico(), distinct: ["uf"], select: { uf: true }, orderBy: { uf: "asc" } }),
    usuario ? db.talento.findUnique({ where: { usuarioId: usuario.id }, select: { aberto: true, status: true } }) : null,
    podeVerContatosDeTalentos(usuario),
  ]);
  const paginas = Math.max(1, Math.ceil(total / TALENTOS_POR_PAGINA));
  const pagina = Number.isInteger(pedida) && pedida >= 1 ? Math.min(pedida, paginas) : 1;
  const talentos = await db.talento.findMany({
    where: onde,
    orderBy: { atualizadoEm: "desc" },
    skip: (pagina - 1) * TALENTOS_POR_PAGINA,
    take: TALENTOS_POR_PAGINA,
    select: { id: true, nome: true, titulo: true, habilidades: true, contratos: true, modalidades: true, cidade: true, uf: true },
  });
  const temFiltro = Object.values(filtros).some(Boolean);
  const ufsComTalento = ufs.map((t) => t.uf).filter((uf) => (UFS as readonly string[]).includes(uf));

  return (
    <>
      <div className="mt-6">
        <AvisoDaUrl codigo={parametros.aviso} />
      </div>

      <section className="cartao mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        {meu ? (
          <>
            <p className="text-sm">
              {meu.status === "suspenso"
                ? "Seu perfil foi tirado da base pela moderação."
                : meu.aberto
                  ? "Seu perfil está na base: você aparece como aberto a trabalho."
                  : "Seu perfil está pausado e não aparece na base."}
            </p>
            <Link href="/vagas/talentos/meu-perfil" className="botao-claro shrink-0">
              Meu perfil
            </Link>
          </>
        ) : (
          <>
            <div>
              <p className="font-semibold">Está procurando trabalho?</p>
              <p className="text-sm text-suave">Crie seu perfil em dois minutos e apareça para os negócios do diretório.</p>
            </div>
            <Link href="/vagas/talentos/meu-perfil" className="botao-coral shrink-0">
              Estou aberto a trabalho
            </Link>
          </>
        )}
      </section>

      {/* Um formulário GET comum: filtra sem JavaScript e a URL pode ser compartilhada. */}
      <form action="/vagas/talentos" className="cartao mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-5">
          <label htmlFor="busca" className="rotulo">
            Habilidade, profissão ou cidade
          </label>
          <input id="busca" name="busca" defaultValue={filtros.busca} maxLength={80} className="campo" placeholder="Ex.: confeiteira, Excel, Recife" />
        </div>
        <SeletorDeFiltro id="area" rotulo="Área" valor={filtros.area} opcoes={Object.entries(AREAS)} vazio="Todas as áreas" />
        <SeletorDeFiltro id="contrato" rotulo="Contratação" valor={filtros.contrato} opcoes={Object.entries(CONTRATOS)} vazio="Qualquer tipo" />
        <SeletorDeFiltro id="modalidade" rotulo="Modalidade" valor={filtros.modalidade} opcoes={Object.entries(MODALIDADES)} vazio="Qualquer modalidade" />
        <SeletorDeFiltro id="uf" rotulo="Estado" valor={filtros.uf} opcoes={ufsComTalento.map((uf) => [uf, uf])} vazio="Todos os estados" />
        <div className="flex items-end gap-2">
          <button type="submit" className="botao flex-1">
            Filtrar
          </button>
          {temFiltro && (
            <Link href="/vagas/talentos" className="botao-claro">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <p className="mt-6 text-sm text-suave" aria-live="polite">
        {total === 0 ? "Nenhum perfil encontrado." : `${total} ${total === 1 ? "pessoa aberta" : "pessoas abertas"} a trabalho`}
        {total > 0 && !veContatos && " · Contato e currículo aparecem para quem tem um negócio no diretório."}
      </p>
      {total === 0 ? (
        <div className="cartao mt-4 p-8 text-center">
          <p className="font-display text-xl font-semibold">{temFiltro ? "Nada com esses filtros" : "A base está começando"}</p>
          <p className="mt-2 text-suave">{temFiltro ? "Tire um filtro ou volte depois." : "Seja a primeira pessoa a dizer que está aberta a trabalho."}</p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4">
          {talentos.map((talento) => (
            <TalentoCard key={talento.id} talento={talento} />
          ))}
        </ul>
      )}
      <Paginacao atual={pagina} total={paginas} href={(p) => enderecoDaPagina(filtros, p)} />
    </>
  );
}
