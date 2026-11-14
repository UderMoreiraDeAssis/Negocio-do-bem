"use client";

import { useActionState, useState } from "react";
import { salvarTalentoAcao } from "@/acoes/talentos";
import { Aviso } from "@/components/Aviso";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Campo } from "@/components/Campo";
import { CampoMunicipio } from "@/components/CampoMunicipio";
import { enviarSemLimpar } from "@/components/envio";
import { AREAS, CONTRATOS, MODALIDADES } from "@/lib/vagas-rotulos";

export type TalentoSalvo = {
  nome: string;
  titulo: string;
  sobre: string;
  procura: string;
  habilidades: string[];
  areas: string[];
  contratos: string[];
  modalidades: string[];
  municipio: string;
  email: string;
  whatsapp: string;
  link: string;
  aberto: boolean;
  curriculoNome: string | null;
};

/** O perfil de talento da pessoa: cria na primeira vez, edita depois. */
export function FormTalento({ salvo }: { salvo: TalentoSalvo }) {
  const [estado, acao, pendente] = useActionState(salvarTalentoAcao, undefined);
  const [arquivo, setArquivo] = useState("");
  const enviado = estado?.valores;
  const valor = (campo: keyof TalentoSalvo) => {
    const v = enviado?.[campo];
    if (typeof v === "string") return v;
    const original = salvo[campo];
    return Array.isArray(original) ? original.join(", ") : typeof original === "string" ? original : "";
  };
  const marcado = (campo: "areas" | "contratos" | "modalidades", chave: string) => {
    if (enviado) return ([] as string[]).concat(enviado[campo] ?? []).includes(chave);
    return salvo[campo].includes(chave);
  };
  const erro = (campo: string) => estado?.erros?.[campo];
  const novo = !salvo.titulo;

  const grupo = (campo: "areas" | "contratos" | "modalidades", rotulo: string, conjunto: Record<string, string>) => (
    <fieldset>
      <legend className="rotulo">{rotulo}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(conjunto).map(([chave, nome]) => (
          <label key={chave} className="flex cursor-pointer items-center gap-2 rounded-full border border-linha px-3 py-1.5 text-sm has-checked:border-coral has-checked:bg-coral-50 has-checked:text-coral-700">
            <input type="checkbox" name={campo} value={chave} defaultChecked={marcado(campo, chave)} className="h-4 w-4 accent-coral" />
            {nome}
          </label>
        ))}
      </div>
      {erro(campo) && <p className="erro-campo">{erro(campo)}</p>}
    </fieldset>
  );

  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-6" noValidate>
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado?.erros && <Aviso tipo="erro">Confira os campos marcados abaixo.</Aviso>}

      <section className="cartao space-y-5 p-6">
        <h2 className="font-display text-xl font-semibold">Quem é você</h2>
        <Campo id="nome" rotulo="Como quer aparecer" erro={erro("nome")} ajuda="Seu nome, ou nome e sobrenome. Aparece na base para todo mundo.">
          <input id="nome" name="nome" autoComplete="name" required minLength={3} maxLength={80} defaultValue={valor("nome")} className="campo" />
        </Campo>
        <Campo id="titulo" rotulo="Título profissional" erro={erro("titulo")} ajuda='Por exemplo, "Confeiteira com 5 anos de experiência" ou "Estudante de design".'>
          <input id="titulo" name="titulo" required minLength={5} maxLength={100} defaultValue={valor("titulo")} className="campo" />
        </Campo>
        <Campo id="sobre" rotulo="Sobre você" erro={erro("sobre")} ajuda="Sua experiência, cursos e do que você se orgulha. Sem telefone, e-mail ou links aqui.">
          <textarea id="sobre" name="sobre" rows={5} required minLength={30} maxLength={1500} defaultValue={valor("sobre")} className="campo" />
        </Campo>
        <Campo id="habilidades" rotulo="Habilidades" erro={erro("habilidades")} ajuda="Separe por vírgula. Até 15. Ex.: atendimento, caixa, Excel, inglês básico.">
          <input id="habilidades" name="habilidades" required maxLength={700} defaultValue={valor("habilidades")} className="campo" />
        </Campo>
        <CampoMunicipio valorInicial={valor("municipio")} erro={erro("municipio")} />
      </section>

      <section className="cartao space-y-5 p-6">
        <h2 className="font-display text-xl font-semibold">O que você procura</h2>
        <Campo id="procura" rotulo="Em poucas palavras" erro={erro("procura")} ajuda='Ex.: "Primeiro emprego em cozinha, de manhã, perto do centro".'>
          <textarea id="procura" name="procura" rows={3} required minLength={10} maxLength={500} defaultValue={valor("procura")} className="campo" />
        </Campo>
        {grupo("areas", "Áreas", AREAS)}
        {grupo("contratos", "Tipos de contratação", CONTRATOS)}
        {grupo("modalidades", "Modalidade", MODALIDADES)}
      </section>

      <section className="cartao space-y-5 p-6">
        <div>
          <h2 className="font-display text-xl font-semibold">Contato e currículo</h2>
          <p className="mt-1 text-sm text-suave">Só quem tem um negócio no diretório e a moderação veem esta parte.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo id="email" rotulo="E-mail" erro={erro("email")}>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={200} defaultValue={valor("email")} className="campo" />
          </Campo>
          <Campo id="whatsapp" rotulo="WhatsApp (opcional)" erro={erro("whatsapp")}>
            <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" defaultValue={valor("whatsapp")} placeholder="(11) 99148-8052" className="campo" />
          </Campo>
        </div>
        <Campo id="link" rotulo="LinkedIn, portfólio ou currículo online (opcional)" erro={erro("link")}>
          <input id="link" name="link" inputMode="url" autoComplete="url" maxLength={300} defaultValue={valor("link")} placeholder="linkedin.com/in/seunome" className="campo" />
        </Campo>
        <Campo
          id="curriculo"
          rotulo={salvo.curriculoNome ? "Trocar o currículo (opcional)" : "Currículo em PDF ou Word (opcional)"}
          erro={erro("curriculo")}
          ajuda={arquivo ? `Escolhido: ${arquivo}` : salvo.curriculoNome ? `Atual: ${salvo.curriculoNome}` : "Até 5 MB."}
        >
          <input
            id="curriculo"
            name="curriculo"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? "")}
            className="campo file:mr-3 file:rounded-full file:border-0 file:bg-areia file:px-3 file:py-1 file:text-sm file:font-semibold"
          />
        </Campo>
        {salvo.curriculoNome && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="removerCurriculo" value="sim" className="h-4 w-4 accent-coral" />
            Apagar o currículo atual
          </label>
        )}
      </section>

      <section className="cartao space-y-4 p-6">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="aberto" value="sim" defaultChecked={enviado ? enviado.aberto === "sim" : salvo.aberto} className="mt-1 h-5 w-5 accent-coral" />
          <span>
            <span className="font-semibold">Estou aberto a trabalho</span>
            <span className="block text-sm text-suave">Desmarque para sair da base sem apagar o perfil.</span>
          </span>
        </label>
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="consentimento" value="sim" defaultChecked={enviado ? enviado.consentimento === "sim" : !novo} required className="mt-1 h-4 w-4 accent-coral" />
            <span>
              Autorizo mostrar meu perfil no banco de talentos e que os negócios do diretório vejam meu contato e currículo, só para me oferecer trabalho. Posso pausar ou apagar
              tudo quando quiser.
            </span>
          </label>
          {erro("consentimento") && <p className="erro-campo">{erro("consentimento")}</p>}
        </div>
        <BotaoEnviar pendente={pendente} enviando="Salvando…" className="botao-coral">
          {novo ? "Entrar no banco de talentos" : "Salvar perfil"}
        </BotaoEnviar>
      </section>
    </form>
  );
}
