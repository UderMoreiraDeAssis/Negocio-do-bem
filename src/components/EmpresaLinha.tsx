import Link from "next/link";
import type { EmpresaResumo } from "@/components/EmpresaCard";
import { FotoEmpresa } from "@/components/FotoEmpresa";
import { formatarLocalizacao } from "@/lib/endereco";

/** O negócio numa linha, para o diretório em modo lista. */
export function EmpresaLinha({ empresa }: { empresa: EmpresaResumo }) {
  return (
    <Link
      href={`/empresas/${empresa.instagramUsername}`}
      className="group cartao flex items-center gap-4 rounded-2xl px-4 py-3.5 transition hover:border-coral/30 hover:bg-coral-50/40"
    >
      <FotoEmpresa empresa={empresa} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-serif text-lg leading-tight font-semibold group-hover:text-coral-700">{empresa.nome}</span>
          {empresa.status === "verificada" && (
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-folha" role="img" aria-label="Verificado pelo dono">
              <path
                fill="currentColor"
                d="M10 1.5 12.2 3l2.6-.2.9 2.5 2.3 1.3-.6 2.6.6 2.6-2.3 1.3-.9 2.5-2.6-.2L10 17l-2.2-1.5-2.6.2-.9-2.5L2 11.9l.6-2.6L2 6.6l2.3-1.3.9-2.5 2.6.2L10 1.5Zm3.5 6-1-1-3.6 3.6-1.6-1.6-1 1 2.6 2.6 4.6-4.6Z"
              />
            </svg>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm text-tinta/85">{empresa.resumo}</span>
        <span className="mt-0.5 block truncate text-xs text-suave sm:hidden">
          {empresa.categoria} · {formatarLocalizacao(empresa)}
        </span>
      </span>
      <span className="hidden max-w-60 text-right text-sm leading-snug break-words text-suave sm:block">
        {empresa.categoria}
        <br />
        {formatarLocalizacao(empresa)}
      </span>
      <span aria-hidden="true" className="text-suave transition group-hover:translate-x-0.5 group-hover:text-coral-700">
        →
      </span>
    </Link>
  );
}
