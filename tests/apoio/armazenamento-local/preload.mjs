import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

const lstat = fs.lstat;
const historias = path.resolve("public/enviados/historias");
let leiturasDaPasta = 0;
let leiturasDoArquivo = 0;
let trocou = false;
fs.lstat = async function (destino, ...opcoes) {
  const estado = await lstat(destino, ...opcoes);
  if (String(destino) === historias) leiturasDaPasta++;
  const momento = process.env.LOCAL_TESTE_TROCA;
  const depoisDaPasta = momento === "pasta" && String(destino) === historias && leiturasDaPasta === 2;
  const arquivoSelecionado = String(destino).endsWith("/ffffffffffffffffffffffff.jpg");
  if (arquivoSelecionado) leiturasDoArquivo++;
  // O inventário agora lê o inode; as corridas destrutivas disparam na leitura antes do unlink.
  const depoisDoArquivo = momento === "arquivo" && arquivoSelecionado && leiturasDoArquivo === 2;
  const trocarDiretorio = momento?.startsWith("diretorio") && arquivoSelecionado && leiturasDoArquivo === 2;
  const trocarEntrada = momento === "entrada" && arquivoSelecionado && leiturasDoArquivo === 2;
  const trocarInode = momento === "arquivo-substituido" && arquivoSelecionado && leiturasDoArquivo === 1;
  if (!trocou && (depoisDaPasta || depoisDoArquivo || trocarDiretorio || trocarEntrada || trocarInode)) {
    trocou = true;
    if (trocarEntrada) {
      await fs.rename(destino, `${destino}-original`);
      await fs.symlink(path.resolve("../fora/ffffffffffffffffffffffff.jpg"), destino);
    } else if (trocarInode) {
      await fs.rename(destino, `${destino}-original`);
      await fs.writeFile(destino, "arquivo substituto preservado");
    } else {
      await fs.rename(historias, `${historias}-original`);
      if (trocarDiretorio) {
        if (momento !== "diretorio-removido") {
          await fs.mkdir(historias);
          if (momento !== "diretorio-vazio") {
            await fs.writeFile(path.join(historias, path.basename(destino)), "arquivo substituto preservado");
          }
        }
        if (["diretorio-ausente", "diretorio-unlink-ausente"].includes(momento)) await fs.unlink(destino);
      } else {
        await fs.symlink(path.resolve("../fora"), historias, "dir");
      }
    }
    await fs.writeFile(path.resolve("../troca-provada"), momento);
    if (momento === "diretorio-ausente") return lstat(destino, ...opcoes);
  }
  return estado;
};
const unlink = fs.unlink;
fs.unlink = async function (destino, ...opcoes) {
  await unlink(destino, ...opcoes);
  if (!trocou && process.env.LOCAL_TESTE_TROCA === "entrada-recriada" && String(destino).endsWith("/ffffffffffffffffffffffff.jpg")) {
    trocou = true;
    await fs.writeFile(destino, "arquivo substituto preservado");
    await fs.writeFile(path.resolve("../troca-provada"), "entrada-recriada");
  }
};
syncBuiltinESMExports();
