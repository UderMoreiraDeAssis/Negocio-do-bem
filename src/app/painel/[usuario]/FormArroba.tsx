"use client";

import { useActionState } from "react";
import { pedirTrocaDeArrobaAcao } from "@/acoes/arroba";
import { Aviso } from "@/components/Aviso";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Campo } from "@/components/Campo";
import { enviarSemLimpar } from "@/components/envio";

/** O dono pede a troca do @ do negócio. A troca só vale quando a moderação aprova. */
export function FormArroba({ empresaId, semInstagram }: { empresaId: string; semInstagram: boolean }) {
  const [estado, acao, pendente] = useActionState(pedirTrocaDeArrobaAcao, undefined);
  const enviado = estado?.valores?.arroba;

  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <input type="hidden" name="empresaId" value={empresaId} />
      <Campo
        id="arroba"
        rotulo={semInstagram ? "@ do negócio no Instagram" : "@ novo"}
        erro={estado?.erros?.arroba}
        ajuda="Pode colar o link do perfil. Use a conta profissional do negócio: só ela traz a foto do Instagram."
      >
        <input
          id="arroba"
          name="arroba"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="@padariadobairro"
          defaultValue={typeof enviado === "string" ? enviado : ""}
          className="campo max-w-xs"
        />
      </Campo>
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} enviando="Enviando…" className="botao-claro">
        Pedir a troca
      </BotaoEnviar>
    </form>
  );
}
