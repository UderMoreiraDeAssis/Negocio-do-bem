import { useSyncExternalStore } from "react";
import { CHAVE_DO_RASCUNHO, lerRascunho, type Rascunho } from "@/lib/rascunho-do-cadastro";

// O rascunho do cadastro por etapas, guardado neste aparelho enquanto a pessoa
// entra, cria a conta ou confirma o e-mail. Só o navegador lê: no servidor e na
// hidratação ele não existe, e os formulários recebem os valores logo depois.

function lerDoAparelho(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DO_RASCUNHO);
  } catch {
    return null;
  }
}

function assinarAparelho(aviso: () => void) {
  window.addEventListener("storage", aviso);
  return () => window.removeEventListener("storage", aviso);
}

/** O rascunho guardado neste aparelho. Com `ativo` falso, ou sem rascunho, null. */
export function useRascunhoDoAparelho(ativo: boolean): Rascunho | null {
  const guardado = useSyncExternalStore(assinarAparelho, lerDoAparelho, () => null);
  if (!ativo || !guardado) return null;
  try {
    return lerRascunho(JSON.parse(guardado));
  } catch {
    return null;
  }
}

/** Guarda as respostas antes de a pessoa sair para entrar, criar a conta ou abrir o e-mail. */
export function guardarRascunhoNoAparelho(rascunho: Rascunho) {
  try {
    window.localStorage.setItem(CHAVE_DO_RASCUNHO, JSON.stringify(rascunho));
  } catch {
    // Sem armazenamento (navegação privada), a pessoa preenche de novo depois de entrar.
  }
}

/** Publicar apaga o rascunho: ele não volta num próximo cadastro. */
export function apagarRascunhoDoAparelho() {
  try {
    window.localStorage.removeItem(CHAVE_DO_RASCUNHO);
  } catch {
    // Nada a limpar.
  }
}
