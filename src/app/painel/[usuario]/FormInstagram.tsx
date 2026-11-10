"use client";

import { useActionState } from "react";
import { trocarArrobaDaEmpresa } from "@/acoes/empresas";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Campo } from "@/components/Campo";
import { enviarSemLimpar } from "@/components/envio";
import { rotuloDoInstagram, temInstagram } from "@/lib/endereco";

/** A moderação troca o @ do Instagram do negócio, que também é o endereço da página (#298). O dono pede a troca (#299). */
export function FormInstagram({ empresa, voltar }: { empresa: { id: string; instagramUsername: string }; voltar: string }) {
  const [estado, acao] = useActionState(trocarArrobaDaEmpresa, undefined);
  const comInstagram = temInstagram(empresa.instagramUsername);
  const digitado = estado?.valores?.instagram;

  return (
    <section className="cartao space-y-4 p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold">Instagram</h2>
      <p className="text-suave">
        Hoje: <strong className="text-tinta">{rotuloDoInstagram(empresa.instagramUsername)}</strong>. O @ também é o endereço da página
        (negociodobem.com/empresas/<span className="text-tinta">{comInstagram ? empresa.instagramUsername : "@"}</span>). O endereço antigo
        continua levando para o novo.
      </p>
      <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
        <input type="hidden" name="empresaId" value={empresa.id} />
        <input type="hidden" name="voltar" value={voltar} />
        <Campo
          id="novoInstagram"
          rotulo={comInstagram ? "Novo @ do Instagram" : "@ do Instagram"}
          erro={estado?.erros?.instagram}
          ajuda="Pode colar o link do perfil. A troca vale na hora; o Clube do Bem não é suspenso."
        >
          <input
            id="novoInstagram"
            name="instagram"
            required
            maxLength={100}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="@padariadobairro"
            defaultValue={typeof digitado === "string" ? digitado : ""}
            className="campo"
          />
        </Campo>
        <BotaoEnviar className="botao-claro" enviando="Trocando…">
          {comInstagram ? "Trocar o @" : "Salvar o @"}
        </BotaoEnviar>
      </form>
    </section>
  );
}
