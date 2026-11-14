import Link from "next/link";

/** Vagas ou Talentos: dois links que parecem abas, um para cada lado da área de trabalho. */
export function AbasDeVagas({ ativa }: { ativa: "vagas" | "talentos" }) {
  const abas = [
    { id: "vagas", rotulo: "Vagas abertas", href: "/vagas" },
    { id: "talentos", rotulo: "Banco de talentos", href: "/vagas/talentos" },
  ] as const;
  return (
    <nav aria-label="Trabalho do bem" className="mt-6 flex self-start rounded-full bg-areia p-1 sm:inline-flex">
      {abas.map((aba) => (
        <Link
          key={aba.id}
          href={aba.href}
          aria-current={aba.id === ativa ? "page" : undefined}
          className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold whitespace-nowrap transition ${
            aba.id === ativa ? "bg-superficie text-tinta shadow-cartao" : "text-suave hover:text-tinta"
          }`}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
