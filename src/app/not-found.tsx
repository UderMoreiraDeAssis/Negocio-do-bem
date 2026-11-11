import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-24 text-center sm:px-6">
      <p className="font-display text-7xl text-coral">404</p>
      <h1 className="mt-4 font-display text-3xl font-semibold">Não encontramos esta página</h1>
      <p className="mt-2 text-suave">Talvez o negócio tenha mudado de @ ou ainda esteja em moderação.</p>
      <Link href="/" className="botao mt-8">
        Voltar para o início
      </Link>
    </div>
  );
}
