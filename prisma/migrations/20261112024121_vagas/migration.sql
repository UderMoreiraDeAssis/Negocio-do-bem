-- CreateTable
CREATE TABLE "Vaga" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "criadaPorId" TEXT,
    "titulo" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "contrato" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "requisitos" TEXT NOT NULL,
    "beneficios" TEXT,
    "jornada" TEXT NOT NULL,
    "valorMin" INTEGER NOT NULL,
    "valorMax" INTEGER,
    "valorPeriodo" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidatura" (
    "id" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT,
    "cidade" TEXT,
    "curriculoChave" TEXT,
    "curriculoNome" TEXT,
    "link" TEXT,
    "mensagem" TEXT,
    "vistaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vaga_status_prazo_idx" ON "Vaga"("status", "prazo");

-- CreateIndex
CREATE INDEX "Vaga_empresaId_status_idx" ON "Vaga"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Candidatura_vagaId_criadoEm_idx" ON "Candidatura"("vagaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Candidatura_vagaId_email_key" ON "Candidatura"("vagaId", "email");

-- AddForeignKey
ALTER TABLE "Vaga" ADD CONSTRAINT "Vaga_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaga" ADD CONSTRAINT "Vaga_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "Vaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
