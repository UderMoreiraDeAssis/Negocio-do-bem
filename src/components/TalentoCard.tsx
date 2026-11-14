import Link from "next/link";
import { Monograma } from "@/components/Monograma";
import { CONTRATOS, MODALIDADES, type Contrato, type Modalidade } from "@/lib/vagas-rotulos";

export type TalentoDoCard = {
  id: string;
  nome: string;
  titulo: string;
  habilidades: string[];
  contratos: string[];
  modalidades: string[];
  cidade: string;
  uf: string;
};

const HABILIDADES_NO_CARD = 6;

/** Um perfil na base de talentos: quem é, o que sabe fazer e o que procura. O cartão todo leva ao perfil. */
export function TalentoCard({ talento }: { talento: TalentoDoCard }) {
  const sobra = talento.habilidades.length - HABILIDADES_NO_CARD;
  const procura = [
    ...talento.contratos.map((c) => CONTRATOS[c as Contrato]),
    ...talento.modalidades.map((m) => MODALIDADES[m as Modalidade]),
  ].filter(Boolean);
  return (
    <li className="cartao relative p-5 transition hover:-translate-y-0.5">
      <div className="flex items-start gap-4">
        <Monograma nome={talento.nome} chave={talento.id} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-snug font-semibold">
            <Link href={`/vagas/talentos/${talento.id}`} className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-2 focus-visible:outline-coral">
              {talento.nome}
            </Link>
          </h3>
          <p className="text-suave">{talento.titulo}</p>
          <p className="mt-1 text-sm font-medium text-coral-700">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" aria-hidden="true" />
            Aberto a trabalho · {talento.cidade}, {talento.uf}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs font-medium" aria-label="Habilidades">
            {talento.habilidades.slice(0, HABILIDADES_NO_CARD).map((habilidade) => (
              <li key={habilidade} className="rounded-full bg-coral-50 px-3 py-1 text-coral-700">
                {habilidade}
              </li>
            ))}
            {sobra > 0 && <li className="rounded-full px-1 py-1 text-suave">+{sobra}</li>}
          </ul>
          {procura.length > 0 && <p className="mt-3 text-xs text-suave">Procura: {procura.join(" · ")}</p>}
        </div>
      </div>
    </li>
  );
}
