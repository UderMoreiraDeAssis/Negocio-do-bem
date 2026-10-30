-- CreateTable
CREATE TABLE "CepConsultado" (
    "cep" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "uf" TEXT,
    "cidade" TEXT,
    "bairro" TEXT,
    "logradouro" TEXT,
    "fonte" TEXT NOT NULL,
    "consultadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CepConsultado_pkey" PRIMARY KEY ("cep")
);

-- CreateTable
CREATE TABLE "CotaCep" (
    "chave" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL,
    "janelaIniciadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotaCep_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "PausaProvedorCep" (
    "provedor" TEXT NOT NULL,
    "falhasSeguidas" INTEGER NOT NULL,
    "pausadoAte" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PausaProvedorCep_pkey" PRIMARY KEY ("provedor")
);

-- CreateIndex
CREATE INDEX "CepConsultado_consultadoEm_idx" ON "CepConsultado"("consultadoEm");

-- CreateIndex
CREATE INDEX "CotaCep_janelaIniciadaEm_idx" ON "CotaCep"("janelaIniciadaEm");
