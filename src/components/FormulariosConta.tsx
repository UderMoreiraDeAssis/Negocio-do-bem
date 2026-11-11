"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  cadastrar,
  concluirCadastroGoogle,
  criarSenhaComLink,
  entrar,
  mandarLinkDeSenhaNova,
  pedirLinkDeAcesso,
  pedirRedefinicaoDeSenha,
  trocarSenha,
} from "@/acoes/conta";
import { Aviso } from "@/components/Aviso";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { enviarSemLimpar } from "@/components/envio";
import { useRascunhoDoAparelho } from "@/components/rascunho-no-aparelho";
import { contatoDoRascunho, voltaAoCadastro } from "@/lib/rascunho-do-cadastro";

function valorTexto(valores: Record<string, string | string[]> | undefined, campo: string): string {
  const v = valores?.[campo];
  return typeof v === "string" ? v : "";
}

function CampoTelefone({ valor, erro }: { valor: string; erro?: string }) {
  return (
    <div>
      <label htmlFor="telefone" className="rotulo">
        Telefone
      </label>
      <input id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 99148-8052" defaultValue={valor} className="campo" aria-invalid={!!erro} />
      {erro ? <p className="erro-campo">{erro}</p> : <p className="ajuda">Com DDD. Só para avisos sobre a sua conta e o seu negócio.</p>}
    </div>
  );
}

export function FormEntrar({ voltar }: { voltar: string }) {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar} />
      <div>
        <label htmlFor="email" className="rotulo">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={valorTexto(estado?.valores, "email")} className="campo" />
      </div>
      <div>
        <label htmlFor="senha" className="rotulo">
          Senha
        </label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required className="campo" />
        <p className="ajuda">
          Esqueceu a senha?{" "}
          <Link href="/esqueci-a-senha" className="link">
            Crie uma nova
          </Link>{" "}
          ou{" "}
          <Link href={`/entrar/link?voltar=${encodeURIComponent(voltar)}`} className="link">
            entre com um link por e-mail
          </Link>
          .
        </p>
      </div>
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} className="botao w-full" enviando="Entrando…">
        Entrar
      </BotaoEnviar>
      <p className="text-center text-sm text-suave">
        Ainda não tem conta?{" "}
        <Link href={`/cadastrar?voltar=${encodeURIComponent(voltar)}`} className="link">
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export function FormPedirLink({ voltar }: { voltar: string }) {
  const [estado, acao, pendente] = useActionState(pedirLinkDeAcesso, undefined);
  const erros = estado?.erros ?? {};
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar} />
      <div>
        <label htmlFor="email" className="rotulo">
          E-mail da sua conta
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={valorTexto(estado?.valores, "email")} className="campo" aria-invalid={!!erros.email} />
        {erros.email ? <p className="erro-campo">{erros.email}</p> : <p className="ajuda">O link vale por 15 minutos e uma vez só.</p>}
      </div>
      <BotaoEnviar pendente={pendente} className="botao w-full" enviando="Enviando…">
        Mandar o link
      </BotaoEnviar>
      <p className="text-center text-sm text-suave">
        Lembrou a senha?{" "}
        <Link href={`/entrar?voltar=${encodeURIComponent(voltar)}`} className="link">
          Entrar com senha
        </Link>
      </p>
    </form>
  );
}

/**
 * Quem cria a conta no meio do cadastro de um negócio já deu o e-mail e o telefone
 * de contato. Eles vêm do rascunho deste aparelho, logo depois da hidratação.
 */
function useContatoDoCadastro(voltar: string) {
  return contatoDoRascunho(useRascunhoDoAparelho(voltaAoCadastro(voltar)));
}

export function FormCadastro({ voltar }: { voltar: string }) {
  const [estado, acao, pendente] = useActionState(cadastrar, undefined);
  const doCadastro = useContatoDoCadastro(voltar);
  const erros = estado?.erros ?? {};
  // Depois de um envio, valem os valores enviados. Antes, o contato do cadastro:
  // o campo ainda intocado mostra o valor novo quando ele chega.
  const valor = (campo: "email" | "telefone") => (estado ? valorTexto(estado.valores, campo) : doCadastro[campo]);
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar} />
      {!estado && (doCadastro.email || doCadastro.telefone) && (
        <p className="text-sm text-suave">Trouxemos o contato que você deu no cadastro do negócio. Pode mudar.</p>
      )}
      <div>
        <label htmlFor="nome" className="rotulo">
          Seu nome
        </label>
        <input id="nome" name="nome" autoComplete="name" required maxLength={80} defaultValue={valorTexto(estado?.valores, "nome")} className="campo" aria-invalid={!!erros.nome} />
        {erros.nome ? <p className="erro-campo">{erros.nome}</p> : <p className="ajuda">Aparece nos seus depoimentos.</p>}
      </div>
      <div>
        <label htmlFor="email" className="rotulo">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={valor("email")} className="campo" aria-invalid={!!erros.email} />
        {erros.email && <p className="erro-campo">{erros.email}</p>}
      </div>
      <CampoTelefone valor={valor("telefone")} erro={erros.telefone} />
      <div>
        <label htmlFor="senha" className="rotulo">
          Senha
        </label>
        <input id="senha" name="senha" type="password" autoComplete="new-password" required minLength={8} className="campo" aria-invalid={!!erros.senha} />
        {erros.senha ? <p className="erro-campo">{erros.senha}</p> : <p className="ajuda">Pelo menos 8 caracteres.</p>}
      </div>
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} className="botao-coral w-full" enviando="Criando conta…">
        Criar conta
      </BotaoEnviar>
      <p className="text-center text-sm text-suave">
        Já tem conta?{" "}
        <Link href={`/entrar?voltar=${encodeURIComponent(voltar)}`} className="link">
          Entrar
        </Link>
      </p>
    </form>
  );
}

/**
 * O passo que falta para quem cria conta pelo Google: o telefone. O e-mail é sempre
 * o do Google; do cadastro do negócio, só o telefone vem preenchido.
 */
export function FormTelefoneGoogle({ email, voltar }: { email: string; voltar: string }) {
  const [estado, acao, pendente] = useActionState(concluirCadastroGoogle, undefined);
  const { telefone } = useContatoDoCadastro(voltar);
  const erros = estado?.erros ?? {};
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <p className="text-sm text-suave">
        Conta do Google: <strong className="font-semibold break-all text-tinta">{email}</strong>
      </p>
      {!estado && telefone && <p className="text-sm text-suave">Trouxemos o telefone que você deu no cadastro do negócio. Pode mudar.</p>}
      <CampoTelefone valor={estado ? valorTexto(estado.valores, "telefone") : telefone} erro={erros.telefone} />
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} className="botao-coral w-full" enviando="Criando conta…">
        Criar conta
      </BotaoEnviar>
      <p className="text-center text-sm text-suave">
        Não é você?{" "}
        <Link href="/cadastrar" className="link">
          Voltar ao cadastro
        </Link>
      </p>
    </form>
  );
}

/** A senha nova, digitada duas vezes: no link de "Esqueci minha senha" e no painel. */
function CamposSenhaNova({ erros }: { erros: Record<string, string> }) {
  return (
    <>
      <div>
        <label htmlFor="novaSenha" className="rotulo">
          Senha nova
        </label>
        <input id="novaSenha" name="novaSenha" type="password" autoComplete="new-password" required minLength={8} className="campo" aria-invalid={!!erros.novaSenha} />
        {erros.novaSenha ? <p className="erro-campo">{erros.novaSenha}</p> : <p className="ajuda">Pelo menos 8 caracteres.</p>}
      </div>
      <div>
        <label htmlFor="confirmarSenha" className="rotulo">
          Repita a senha nova
        </label>
        <input id="confirmarSenha" name="confirmarSenha" type="password" autoComplete="new-password" required className="campo" aria-invalid={!!erros.confirmarSenha} />
        {erros.confirmarSenha && <p className="erro-campo">{erros.confirmarSenha}</p>}
      </div>
    </>
  );
}

export function FormEsqueciASenha() {
  const [estado, acao, pendente] = useActionState(pedirRedefinicaoDeSenha, undefined);
  const erros = estado?.erros ?? {};
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <div>
        <label htmlFor="email" className="rotulo">
          E-mail da sua conta
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={valorTexto(estado?.valores, "email")} className="campo" aria-invalid={!!erros.email} />
        {erros.email ? <p className="erro-campo">{erros.email}</p> : <p className="ajuda">O link vale por 1 hora e uma vez só.</p>}
      </div>
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} className="botao w-full" enviando="Enviando…">
        Mandar o link
      </BotaoEnviar>
      <p className="text-center text-sm text-suave">
        Lembrou a senha?{" "}
        <Link href="/entrar" className="link">
          Entrar
        </Link>
      </p>
    </form>
  );
}

/** Em /link, para quem abriu o link de "Esqueci minha senha". */
export function FormSenhaNova() {
  const [estado, acao, pendente] = useActionState(criarSenhaComLink, undefined);
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <CamposSenhaNova erros={estado?.erros ?? {}} />
      {estado?.erro && (
        <Aviso tipo="erro">
          {estado.erro}{" "}
          <Link href="/esqueci-a-senha" className="link">
            Pedir um link novo
          </Link>
        </Aviso>
      )}
      <BotaoEnviar pendente={pendente} className="botao w-full" enviando="Salvando…">
        Salvar a senha nova
      </BotaoEnviar>
    </form>
  );
}

/** No painel, para quem sabe a senha atual. */
export function FormTrocarSenha() {
  const [estado, acao, pendente] = useActionState(trocarSenha, undefined);
  const erros = estado?.erros ?? {};
  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="space-y-4">
      <div>
        <label htmlFor="senhaAtual" className="rotulo">
          Senha atual
        </label>
        <input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" required className="campo" aria-invalid={!!erros.senhaAtual} />
        {erros.senhaAtual && <p className="erro-campo">{erros.senhaAtual}</p>}
      </div>
      <CamposSenhaNova erros={erros} />
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} className="botao" enviando="Salvando…">
        Trocar a senha
      </BotaoEnviar>
    </form>
  );
}

/** No painel: manda o link de senha nova para quem não tem senha ou esqueceu a atual. */
export function PedirLinkDeSenhaNova({ email, children }: { email: string; children: ReactNode }) {
  const [estado, acao, pendente] = useActionState(mandarLinkDeSenhaNova, undefined);
  return (
    <form action={acao} className="space-y-3">
      <p className="text-sm leading-relaxed text-suave">{children}</p>
      {estado?.enviado && (
        <Aviso tipo="sucesso">
          Mandamos o link para <strong className="font-semibold break-all">{email}</strong>. Ele vale por 1 hora.
        </Aviso>
      )}
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <BotaoEnviar pendente={pendente} className="botao-claro botao-pequeno" enviando="Enviando…">
        Mandar o link de senha nova
      </BotaoEnviar>
    </form>
  );
}
