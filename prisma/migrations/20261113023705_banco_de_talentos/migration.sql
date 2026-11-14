-- CreateTable
CREATE TABLE "Talento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "sobre" TEXT NOT NULL,
    "procura" TEXT NOT NULL,
    "habilidades" TEXT[],
    "areas" TEXT[],
    "contratos" TEXT[],
    "modalidades" TEXT[],
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT,
    "link" TEXT,
    "curriculoChave" TEXT,
    "curriculoNome" TEXT,
    "aberto" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "motivo" TEXT,
    "busca" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Talento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Talento_usuarioId_key" ON "Talento"("usuarioId");

-- CreateIndex
CREATE INDEX "Talento_aberto_status_atualizadoEm_idx" ON "Talento"("aberto", "status", "atualizadoEm");

-- AddForeignKey
ALTER TABLE "Talento" ADD CONSTRAINT "Talento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
