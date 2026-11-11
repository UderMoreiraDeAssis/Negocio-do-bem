/**
 * Ambiente do deploy ("production" ou "preview"), ou undefined fora de um deploy,
 * como no computador de quem desenvolve. Vem do DEPLOY_ENV, que o wrangler.jsonc
 * define. O VERCEL_ENV, do deploy antigo na Vercel, continua valendo para o seed
 * se recusar a rodar com variáveis de produção copiadas de lá. Variável vazia
 * conta como ausente.
 */
export function ambienteDeDeploy(): string | undefined {
  return process.env.DEPLOY_ENV || process.env.VERCEL_ENV || undefined;
}
