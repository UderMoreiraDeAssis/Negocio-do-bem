"use client";

import { useEffect, useRef, useState } from "react";
import { Campo } from "@/components/Campo";
import { CampoMunicipio } from "@/components/CampoMunicipio";
import type { ResultadoCep } from "@/lib/cep";
import { limparCep, type CampoEndereco } from "@/lib/endereco";
import { REGIOES_DF } from "@/lib/regioes-df";
import { formatarMunicipio, normalizarTexto } from "@/lib/texto";

const AVISOS: Partial<Record<ResultadoCep["situacao"] | "falha", string>> = {
  inexistente: "Não encontramos esse CEP. Confira os números ou preencha o endereço à mão.",
  limite: "Muitas consultas seguidas. Preencha o endereço à mão ou tente de novo daqui a alguns minutos.",
  indisponivel: "A consulta de CEP está indisponível agora. Preencha o endereço à mão.",
  falha: "A consulta de CEP está indisponível agora. Preencha o endereço à mão.",
};

/** Preenche só um campo vazio: nunca apaga o que a pessoa escreveu. */
function preencherSeVazio(formulario: HTMLFormElement, nome: string, valor: string | null): boolean {
  const campo = formulario.elements.namedItem(nome);
  if (!valor || !(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement) || campo.value.trim()) return false;
  campo.value = valor;
  return true;
}

/**
 * Consulta o CEP quando ele fica completo (ver src/app/api/cep/route.ts), sem uma
 * requisição por tecla, e preenche os campos vazios. Sem JavaScript, ou com a
 * consulta desligada ou fora do ar, o endereço continua sendo preenchido à mão.
 */
function useConsultaDeCep(aoEncontrar: (formulario: HTMLFormElement, resultado: Extract<ResultadoCep, { situacao: "encontrado" }>) => string) {
  const [aviso, setAviso] = useState("");
  const ultimo = useRef<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  const consulta = useRef<AbortController>(undefined);

  useEffect(() => () => {
    clearTimeout(espera.current);
    consulta.current?.abort();
  }, []);

  function aoMudar(campo: HTMLInputElement) {
    clearTimeout(espera.current);
    const cep = limparCep(campo.value);
    if (!cep || cep === ultimo.current || !campo.form) return;
    const formulario = campo.form;
    espera.current = setTimeout(async () => {
      ultimo.current = cep;
      consulta.current?.abort();
      consulta.current = new AbortController();
      setAviso("Buscando o endereço do CEP…");
      try {
        const resposta = await fetch(`/api/cep?cep=${cep}`, { signal: consulta.current.signal });
        const resultado = (await resposta.json()) as ResultadoCep;
        setAviso(resultado.situacao === "encontrado" ? aoEncontrar(formulario, resultado) : AVISOS[resultado.situacao] ?? "");
      } catch (erro) {
        if ((erro as Error).name !== "AbortError") setAviso(AVISOS.falha!);
      }
    }, 500);
  }

  return { aviso, aoMudar };
}

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
  // Trocar a chave recria o campo de cidade com o valor vindo do CEP.
  const [municipio, setMunicipio] = useState({ chave: 0, valor: valor("municipio") });
  const { aviso, aoMudar } = useConsultaDeCep((formulario, { endereco, aConfirmar }) => {
    const campoMunicipio = formulario.elements.namedItem("municipio");
    const cidadeAtual = campoMunicipio instanceof HTMLInputElement ? campoMunicipio.value.trim() : "";
    const cidadeDoCep = endereco.cidade ? formatarMunicipio(endereco.cidade, endereco.uf) : null;
    if (cidadeDoCep && !cidadeAtual) setMunicipio((atual) => ({ chave: atual.chave + 1, valor: cidadeDoCep }));
    const preenchidos = [
      preencherSeVazio(formulario, "logradouro", endereco.logradouro),
      preencherSeVazio(formulario, "bairro", endereco.bairro),
      preencherSeVazio(formulario, "regiaoAdministrativa", endereco.regiaoAdministrativa),
    ].some(Boolean) || (!!cidadeDoCep && !cidadeAtual);
    const partes = [
      preenchidos ? "Preenchemos os campos vazios com o endereço do CEP." : "Os campos já estavam preenchidos; nada foi alterado.",
      "Confira e complete o número e o complemento.",
    ];
    if (cidadeDoCep && cidadeAtual && normalizarTexto(cidadeAtual) !== normalizarTexto(cidadeDoCep)) {
      partes.push(`Atenção: o CEP é de ${cidadeDoCep}, mas a cidade informada é outra.`);
    }
    if (aConfirmar) partes.push("Os dados vêm de uma consulta anterior e podem estar desatualizados.");
    return partes.join(" ");
  });

  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="mb-2 font-serif text-2xl font-semibold">Localização</legend>
      <p className="text-sm text-suave">Só a cidade é obrigatória. Bairro, região e localidade aparecem no perfil e na busca.</p>
      <CampoMunicipio key={municipio.chave} valorInicial={municipio.valor} erro={erros.municipio} />
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
      <Campo id="cep" rotulo="CEP (opcional)" erro={erros.cep} ajuda="Com ou sem hífen. Ao completar o CEP, buscamos o endereço para os campos vazios; você também pode preencher à mão.">
        <input id="cep" name="cep" inputMode="numeric" maxLength={9} placeholder="00000-000" defaultValue={valor("cep")} aria-invalid={!!erros.cep} onChange={(evento) => aoMudar(evento.currentTarget)} className="campo" />
      </Campo>
      <p role="status" aria-live="polite" className="text-sm text-suave empty:hidden">{aviso}</p>
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
