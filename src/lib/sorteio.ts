/**
 * Sorteia até `quantos` itens sem repetir, com chance proporcional ao peso: um item de
 * peso 4 sai, em média, quatro vezes mais que um de peso 1. Peso zero ou negativo nunca
 * sai. Usa o método de Efraimidis e Spirakis: cada item ganha a nota sorteio^(1/peso) e
 * ficam os de nota maior.
 */
export function sortearComPeso<T>(itens: { item: T; peso: number }[], quantos: number, aleatorio: () => number = Math.random): T[] {
  return itens
    .filter((i) => i.peso > 0)
    .map((i) => ({ item: i.item, nota: Math.pow(aleatorio(), 1 / i.peso) }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, Math.max(0, quantos))
    .map((i) => i.item);
}
