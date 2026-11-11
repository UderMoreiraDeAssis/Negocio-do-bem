import Link from "next/link";
import { CausaBadge } from "@/components/CausaBadge";
import { CoracaoFavorito, type EstadoFavorito } from "@/components/CoracaoFavorito";
import { FotoEmpresa } from "@/components/FotoEmpresa";
import { SeloStatus } from "@/components/SeloStatus";
import { filtrarCausas } from "@/lib/causas";
import { formatarLocalizacao, type Endereco } from "@/lib/endereco";

export type EmpresaResumo = Endereco & {
  id: string;
  instagramUsername: string;
  nome: string;
  fotoUrl: string | null;
  resumo: string;
  categoria: string;
  cidade: string;
  uf: string;
  status: string;
  causas: { causa: string }[];
  _count: { depoimentos: number };
  // A oferta do Clube do Bem que está valendo, se houver (o selo de cupom).
  ofertas?: { id: string }[];
};

const MAX_BADGES = 3;

/** Posição no ranking da página inicial ("Os mais queridos") e o número que a explica. */
export type DestaqueDoCard = { posicao: number; numero: string };

/**
 * O negócio num card do diretório. Com `favorito`, ganha o coração no canto, fora do link
 * do card (um botão não pode ficar dentro de um link). Com `destaque`, mostra a posição
 * no ranking no lugar do rodapé de selos.
 */
export function EmpresaCard({
  empresa,
  favorito,
  destaque,
}: {
  empresa: EmpresaResumo;
  favorito?: EstadoFavorito;
  destaque?: DestaqueDoCard;
}) {
  const causas = filtrarCausas(empresa.causas.map((c) => c.causa));
  const depoimentos = empresa._count.depoimentos;
  return (
    <div className="group relative flex flex-col transition duration-200 hover:-translate-y-0.5">
      <Link
        href={`/empresas/${empresa.instagramUsername}`}
        className="cartao flex flex-1 flex-col gap-3 p-5 transition duration-200 group-hover:shadow-flutuante escuro:group-hover:border-tinta/25"
      >
        <div className={`flex items-center gap-3 ${favorito ? "pr-10" : ""}`}>
          <FotoEmpresa empresa={empresa} />
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-display text-[17px] leading-tight font-semibold tracking-tight break-words">
              {empresa.nome}
            </h3>
            <p className="mt-0.5 truncate text-[13px] text-suave">
              {empresa.categoria} · {formatarLocalizacao(empresa)}
            </p>
          </div>
        </div>

        <p className="line-clamp-2 text-[15px] leading-relaxed text-tinta/80">{empresa.resumo}</p>

        {causas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {causas.slice(0, MAX_BADGES).map((slug) => (
              <CausaBadge key={slug} slug={slug} />
            ))}
            {causas.length > MAX_BADGES && (
              <span className="rounded-full bg-areia px-2.5 py-1 text-xs font-semibold text-suave">
                +{causas.length - MAX_BADGES}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {destaque ? (
            <>
              <span
                className={`rounded-full px-2.5 py-0.5 font-display text-[13px] font-bold ${destaque.posicao === 1 ? "bg-coral text-white" : "bg-tinta text-papel"}`}
              >
                {destaque.posicao}º
              </span>
              <span className="text-[13px] font-semibold text-tinta">{destaque.numero}</span>
            </>
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-1.5">
                <SeloStatus status={empresa.status} />
                {!!empresa.ofertas?.length && (
                  <span className="rounded-full bg-coral-50 px-2.5 py-1 text-xs font-semibold text-coral-700">Cupom</span>
                )}
              </span>
              {depoimentos > 0 && (
                <span className="text-xs text-suave">
                  {depoimentos} {depoimentos === 1 ? "depoimento" : "depoimentos"}
                </span>
              )}
            </>
          )}
        </div>
      </Link>
      {favorito && <CoracaoFavorito estado={favorito} nome={empresa.nome} className="absolute top-3 right-3" />}
    </div>
  );
}
