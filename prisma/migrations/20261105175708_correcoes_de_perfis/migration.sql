-- CreateTable
CREATE TABLE "CorrecaoPerfil" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "autorId" TEXT,
    "problema" TEXT NOT NULL,
    "correcao" TEXT NOT NULL,
    "fonte" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "revisadoPorId" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrecaoPerfil_pkey" PRIMARY KEY ("id")
);

-- Rejeita estados desconhecidos que deixariam avisos invisíveis na fila de moderação.
ALTER TABLE "CorrecaoPerfil"
ADD CONSTRAINT "CorrecaoPerfil_status_check"
CHECK ("status" IN ('pendente', 'corrigido', 'sem_mudanca'));

-- CreateIndex
CREATE INDEX "CorrecaoPerfil_status_criadoEm_idx" ON "CorrecaoPerfil"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "CorrecaoPerfil_autorId_criadoEm_idx" ON "CorrecaoPerfil"("autorId", "criadoEm");

-- CreateIndex
CREATE INDEX "CorrecaoPerfil_empresaId_idx" ON "CorrecaoPerfil"("empresaId");

-- AddForeignKey
ALTER TABLE "CorrecaoPerfil" ADD CONSTRAINT "CorrecaoPerfil_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrecaoPerfil" ADD CONSTRAINT "CorrecaoPerfil_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrecaoPerfil" ADD CONSTRAINT "CorrecaoPerfil_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
