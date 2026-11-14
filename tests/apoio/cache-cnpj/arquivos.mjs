import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Mede arquivos de build. A promoção de route-cache é estado de execução do Next, não recompilação. */
export function artefatos(raiz) {
  const itens = {};
  const cacheDeRota = resolve(raiz, ".next/server/route-cache");
  function visitar(caminho) {
    if (caminho === cacheDeRota) return;
    if (statSync(caminho).isDirectory()) {
      for (const nome of readdirSync(caminho)) visitar(resolve(caminho, nome));
    } else {
      itens[caminho.slice(raiz.length)] = createHash("sha256").update(readFileSync(caminho)).digest("hex");
    }
  }
  for (const caminho of [".next/BUILD_ID", ".next/server", ".next/static"]) visitar(resolve(raiz, caminho));
  return itens;
}
