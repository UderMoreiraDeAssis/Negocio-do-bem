import type { NextRequest } from "next/server";
import { ipDoCabecalho } from "@/lib/auth/tentativas";
import { consultarCep } from "@/lib/cep";

const STATUS = { invalido: 400, limite: 429 } as const;

/**
 * Consulta de CEP do formulário de endereço (ver src/lib/cep.ts). Só ajuda a
 * preencher: qualquer resposta diferente de "encontrado" deixa a pessoa seguir à mão.
 */
export async function GET(request: NextRequest) {
  const resultado = await consultarCep(request.nextUrl.searchParams.get("cep") ?? "", ipDoCabecalho(request.headers));
  return Response.json(resultado, {
    status: resultado.situacao in STATUS ? STATUS[resultado.situacao as keyof typeof STATUS] : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
