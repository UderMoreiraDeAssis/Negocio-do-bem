import { describe, expect, it } from "vitest";
import { sortearComPeso } from "@/lib/sorteio";

/** Um gerador previsível, para o teste repetir sempre igual. */
function semente(valor: number) {
  return () => {
    valor = (valor * 1103515245 + 12345) % 2147483648;
    return valor / 2147483648;
  };
}

describe("sortearComPeso", () => {
  it("devolve no máximo a quantidade pedida, sem repetir e sem peso zero", () => {
    const itens = [
      { item: "a", peso: 1 },
      { item: "b", peso: 2 },
      { item: "zero", peso: 0 },
    ];
    const sorteados = sortearComPeso(itens, 5, semente(7));
    expect([...sorteados].sort()).toEqual(["a", "b"]);
    expect(sortearComPeso(itens, 1, semente(7))).toHaveLength(1);
    expect(sortearComPeso([], 2)).toEqual([]);
  });

  it("dá mais chance a quem tem mais peso", () => {
    const aleatorio = semente(42);
    const vezes = { pesado: 0, leve: 0 };
    for (let i = 0; i < 4000; i++) {
      const [primeiro] = sortearComPeso(
        [
          { item: "pesado" as const, peso: 4 },
          { item: "leve" as const, peso: 1 },
        ],
        1,
        aleatorio,
      );
      vezes[primeiro]++;
    }
    // Com pesos 4 e 1, o pesado sai em 80% das vezes.
    expect(vezes.pesado / 4000).toBeGreaterThan(0.75);
    expect(vezes.pesado / 4000).toBeLessThan(0.85);
  });
});
