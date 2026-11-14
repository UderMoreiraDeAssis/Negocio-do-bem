import Link from "next/link";
import { FotoEmpresa } from "@/components/FotoEmpresa";
import { AREAS, CONTRATOS, MODALIDADES, rotuloDoValor, type Area, type Contrato, type Modalidade } from "@/lib/vagas";
import { formatarDataCurta } from "@/lib/texto";

export type VagaDoCard = {
  id: string;
  titulo: string;
  area: string;
  contrato: string;
  modalidade: string;
  valorMin: number;
  valorMax: number | null;
  valorPeriodo: string;
  cidade: string;
  uf: string;
  prazo: Date;
  empresa: { nome: string; instagramUsername: string; fotoUrl: string | null };
};

/** Uma vaga na lista: negócio, cargo, valor e onde. O cartão todo leva à vaga. */
export function VagaCard({ vaga, mostrarEmpresa = true }: { vaga: VagaDoCard; mostrarEmpresa?: boolean }) {
  return (
    <li className="cartao relative p-5 transition hover:-translate-y-0.5">
      <div className="flex items-start gap-4">
        {mostrarEmpresa && <FotoEmpresa empresa={vaga.empresa} />}
        <div className="min-w-0 flex-1">
          {mostrarEmpresa && <p className="truncate text-sm text-suave">{vaga.empresa.nome}</p>}
          <h3 className="font-display text-xl leading-snug font-semibold">
            <Link href={`/vagas/${vaga.id}`} className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-2 focus-visible:outline-coral">
              {vaga.titulo}
            </Link>
          </h3>
          <p className="mt-1 font-semibold text-coral-700">{rotuloDoValor(vaga)}</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            {[CONTRATOS[vaga.contrato as Contrato], MODALIDADES[vaga.modalidade as Modalidade], AREAS[vaga.area as Area], `${vaga.cidade}, ${vaga.uf}`]
              .filter(Boolean)
              .map((rotulo) => (
                <li key={rotulo} className="rounded-full bg-areia px-3 py-1 text-suave">
                  {rotulo}
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-suave">Candidaturas até {formatarDataCurta(vaga.prazo)}</p>
        </div>
      </div>
    </li>
  );
}
