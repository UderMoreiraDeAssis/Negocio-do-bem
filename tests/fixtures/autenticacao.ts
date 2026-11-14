import { gerarHashSenha } from "@/lib/auth/senha";

// Só para contas cuja senha precisa funcionar. Fixtures hostis ficam no próprio teste.
export async function dadosDeContaComSenha({ nome, email, senha }: { nome: string; email: string; senha: string | null }) {
  return { nome, email, senhaHash: senha === null ? null : await gerarHashSenha(senha) };
}
