-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "enderecoPublico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "localidade" TEXT,
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "regiaoAdministrativa" TEXT;
