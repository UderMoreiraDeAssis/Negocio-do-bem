CREATE TABLE "FotoAposentada" (
    "dominio" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEm" TIMESTAMP(3),
    CONSTRAINT "FotoAposentada_pkey" PRIMARY KEY ("dominio", "chave")
);
CREATE INDEX "FotoAposentada_chave_idx" ON "FotoAposentada"("chave");
