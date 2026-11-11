-- Pedido do dono para trocar o @ do negócio (#299).
-- Idempotente: a primeira versão desta migração, com outro nome
-- (20261107120000_troca_de_arroba), já foi aplicada no banco dos previews.

-- CreateTable
CREATE TABLE IF NOT EXISTS "TrocaDeArroba" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "arrobaAntigo" TEXT NOT NULL,
    "arrobaNovo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrocaDeArroba_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrocaDeArroba_status_criadoEm_idx" ON "TrocaDeArroba"("status", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrocaDeArroba_empresaId_status_idx" ON "TrocaDeArroba"("empresaId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrocaDeArroba_usuarioId_idx" ON "TrocaDeArroba"("usuarioId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrocaDeArroba_empresaId_fkey') THEN
    ALTER TABLE "TrocaDeArroba" ADD CONSTRAINT "TrocaDeArroba_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrocaDeArroba_usuarioId_fkey') THEN
    ALTER TABLE "TrocaDeArroba" ADD CONSTRAINT "TrocaDeArroba_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrocaDeArroba_decididoPorId_fkey') THEN
    ALTER TABLE "TrocaDeArroba" ADD CONSTRAINT "TrocaDeArroba_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
