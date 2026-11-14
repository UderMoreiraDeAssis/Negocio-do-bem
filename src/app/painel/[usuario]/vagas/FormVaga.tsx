"use client";

import { useActionState } from "react";
import { criarVagaAcao } from "@/acoes/vagas";
import { Aviso } from "@/components/Aviso";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Campo } from "@/components/Campo";
import { CampoMunicipio } from "@/components/CampoMunicipio";
import { enviarSemLimpar } from "@/components/envio";
import { AREAS, CONTRATOS, MODALIDADES, PERIODOS } from "@/lib/vagas-rotulos";

/** A vaga nova do negócio. `hoje`, `ultimoDiaPadrao` e `ultimoDiaMaximo` vêm do servidor, no dia de Brasília. */
export function FormVaga({ empresaId, cidadePadrao, hoje, ultimoDiaPadrao, ultimoDiaMaximo }: { empresaId: string; cidadePadrao: string; hoje: string; ultimoDiaPadrao: string; ultimoDiaMaximo: string }) {
  const [estado, acao, pendente] = useActionState(criarVagaAcao, undefined);
  const valor = (campo: string, padrao = "") => {
    const enviado = estado?.valores?.[campo];
    return typeof enviado === "string" ? enviado : padrao;
  };
  const erro = (campo: string) => estado?.erros?.[campo];
  const opcoes = (conjunto: Record<string, string>) =>
    Object.entries(conjunto).map(([chave, nome]) => (
      <option key={chave} value={chave}>
        {nome}
      </option>
    ));

  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="cartao space-y-5 p-6">
      <input type="hidden" name="empresaId" value={empresaId} />
      <div>
        <h2 className="font-display text-2xl font-semibold">Publicar uma vaga</h2>
        <p className="mt-1 text-sm text-suave">
          Vai ao ar na hora, em Vagas e no perfil do negócio. As pessoas se candidatam pela plataforma, então não coloque links, telefones nem e-mails no texto.
        </p>
      </div>

      <Campo id="titulo" rotulo="Cargo ou serviço" erro={erro("titulo")} ajuda='Por exemplo, "Atendente de padaria".'>
        <input id="titulo" name="titulo" required minLength={5} maxLength={80} defaultValue={valor("titulo")} className="campo" />
      </Campo>

      <div className="grid gap-5 sm:grid-cols-3">
        <Campo id="area" rotulo="Área" erro={erro("area")}>
          <select id="area" name="area" required defaultValue={valor("area")} className="campo">
            <option value="" disabled>Escolha</option>
            {opcoes(AREAS)}
          </select>
        </Campo>
        <Campo id="contrato" rotulo="Contratação" erro={erro("contrato")}>
          <select id="contrato" name="contrato" required defaultValue={valor("contrato")} className="campo">
            <option value="" disabled>Escolha</option>
            {opcoes(CONTRATOS)}
          </select>
        </Campo>
        <Campo id="modalidade" rotulo="Modalidade" erro={erro("modalidade")}>
          <select id="modalidade" name="modalidade" required defaultValue={valor("modalidade")} className="campo">
            <option value="" disabled>Escolha</option>
            {opcoes(MODALIDADES)}
          </select>
        </Campo>
      </div>

      <Campo id="descricao" rotulo="O que a pessoa vai fazer" erro={erro("descricao")}>
        <textarea id="descricao" name="descricao" rows={5} required minLength={30} maxLength={2000} defaultValue={valor("descricao")} className="campo" />
      </Campo>
      <Campo id="requisitos" rotulo="Requisitos" erro={erro("requisitos")} ajuda="Só o que a função exige. A seleção é por competência.">
        <textarea id="requisitos" name="requisitos" rows={3} required minLength={10} maxLength={1500} defaultValue={valor("requisitos")} className="campo" />
      </Campo>
      <Campo id="beneficios" rotulo="Benefícios (opcional)" erro={erro("beneficios")}>
        <textarea id="beneficios" name="beneficios" rows={2} maxLength={500} defaultValue={valor("beneficios")} className="campo" />
      </Campo>

      <fieldset className="space-y-3">
        <legend className="rotulo">Valor (obrigatório: toda vaga mostra quanto paga)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="valorMin" rotulo="De (R$)" erro={erro("valorMin")}>
            <input id="valorMin" name="valorMin" inputMode="numeric" required defaultValue={valor("valorMin")} className="campo" />
          </Campo>
          <Campo id="valorMax" rotulo="Até (R$, opcional)" erro={erro("valorMax")}>
            <input id="valorMax" name="valorMax" inputMode="numeric" defaultValue={valor("valorMax")} className="campo" />
          </Campo>
          <Campo id="valorPeriodo" rotulo="Período" erro={erro("valorPeriodo")}>
            <select id="valorPeriodo" name="valorPeriodo" required defaultValue={valor("valorPeriodo", "mes")} className="campo">
              {opcoes(PERIODOS)}
            </select>
          </Campo>
        </div>
      </fieldset>

      <Campo id="jornada" rotulo="Jornada ou prazo" erro={erro("jornada")} ajuda='Por exemplo, "Segunda a sexta, 8h às 14h" ou "3 meses".'>
        <input id="jornada" name="jornada" required minLength={3} maxLength={100} defaultValue={valor("jornada")} className="campo" />
      </Campo>

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoMunicipio valorInicial={valor("municipio", cidadePadrao)} erro={erro("municipio")} />
        <Campo id="ultimoDia" rotulo="Recebe candidaturas até" erro={erro("ultimoDia")} ajuda="Até 60 dias, contando hoje. Termina às 23h59.">
          <input id="ultimoDia" name="ultimoDia" type="date" required min={hoje} max={ultimoDiaMaximo} defaultValue={valor("ultimoDia", ultimoDiaPadrao)} className="campo" />
        </Campo>
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="respeitaALei" value="sim" defaultChecked={valor("respeitaALei") === "sim"} required className="mt-1 h-4 w-4 accent-coral" />
          <span>Esta vaga respeita a legislação trabalhista, a seleção é por competência, sem discriminação, e vou dar retorno a quem se candidatar.</span>
        </label>
        {erro("respeitaALei") && <p className="erro-campo">{erro("respeitaALei")}</p>}
      </div>

      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} enviando="Publicando…" className="botao-coral">
        Publicar a vaga
      </BotaoEnviar>
    </form>
  );
}
