"use client";

import { Campo } from "@/components/Campo";
import { CampoMunicipio } from "@/components/CampoMunicipio";
import { REGIOES_DF } from "@/lib/regioes-df";
import type { CampoEndereco } from "@/lib/endereco";

/** Os mesmos campos na indicação e na edição pelo dono ou pela moderação. */
export function CamposEndereco({
  valor,
  erros,
  podePublicar = false,
  publico = false,
}: {
  valor: (campo: CampoEndereco) => string;
  erros: Record<string, string>;
  podePublicar?: boolean;
  publico?: boolean;
}) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="mb-2 font-serif text-2xl font-semibold">Localização</legend>
      <p className="text-sm text-suave">Só a cidade é obrigatória. Bairro, região e localidade aparecem no perfil e na busca.</p>
      <CampoMunicipio valorInicial={valor("municipio")} erro={erros.municipio} />
      <Campo id="regiaoAdministrativa" rotulo="Região administrativa (somente no DF)" erro={erros.regiaoAdministrativa} ajuda="No Distrito Federal, escolha Brasília como cidade e informe a região aqui.">
        <select id="regiaoAdministrativa" name="regiaoAdministrativa" defaultValue={valor("regiaoAdministrativa")} aria-invalid={!!erros.regiaoAdministrativa} className="campo">
          <option value="">Não informada / fora do DF</option>
          {REGIOES_DF.map((regiao) => <option key={regiao}>{regiao}</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="bairro" rotulo="Bairro (opcional)" erro={erros.bairro}>
          <input id="bairro" name="bairro" maxLength={100} defaultValue={valor("bairro")} aria-invalid={!!erros.bairro} className="campo" />
        </Campo>
        <Campo id="localidade" rotulo="Distrito ou localidade (opcional)" erro={erros.localidade} ajuda="Pode ser uma comunidade rural, povoado ou setor.">
          <input id="localidade" name="localidade" maxLength={100} defaultValue={valor("localidade")} aria-invalid={!!erros.localidade} className="campo" />
        </Campo>
      </div>
      <p className="text-sm text-suave">
        O endereço abaixo é opcional. Só fica público quando o dono ou a moderação autorizarem na edição do perfil.
        Informe apenas o endereço de atendimento do negócio.
      </p>
      <Campo id="cep" rotulo="CEP (opcional)" erro={erros.cep} ajuda="Com ou sem hífen. Você pode preencher o endereço manualmente.">
        <input id="cep" name="cep" inputMode="numeric" maxLength={9} placeholder="00000-000" defaultValue={valor("cep")} aria-invalid={!!erros.cep} className="campo" />
      </Campo>
      <Campo id="logradouro" rotulo="Logradouro (opcional)" erro={erros.logradouro} ajuda="Rua, avenida, quadra, conjunto, estrada ou outra descrição do endereço.">
        <input id="logradouro" name="logradouro" maxLength={200} defaultValue={valor("logradouro")} aria-invalid={!!erros.logradouro} className="campo" />
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="numero" rotulo="Número (opcional)" erro={erros.numero} ajuda="Aceita letras e “s/n” para endereço sem número.">
          <input id="numero" name="numero" maxLength={30} defaultValue={valor("numero")} aria-invalid={!!erros.numero} className="campo" />
        </Campo>
        <Campo id="complemento" rotulo="Complemento (opcional)" erro={erros.complemento} ajuda="Bloco, lote, conjunto, sala ou referência.">
          <input id="complemento" name="complemento" maxLength={200} defaultValue={valor("complemento")} aria-invalid={!!erros.complemento} className="campo" />
        </Campo>
      </div>
      {podePublicar && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="enderecoPublico" value="sim" defaultChecked={publico} className="mt-1 h-4 w-4 accent-coral" />
          <span>Mostrar CEP, logradouro, número e complemento no perfil público. Confirme que este é um endereço público de atendimento.</span>
        </label>
      )}
    </fieldset>
  );
}
