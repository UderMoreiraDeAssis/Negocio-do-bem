// Áreas, contratos, modalidades e períodos das vagas (#339). Sem `server-only`: os formulários de cliente também usam.

export const AREAS = {
  administrativo: "Administrativo",
  alimentacao: "Alimentação",
  atendimento: "Atendimento e vendas",
  comunicacao: "Comunicação e design",
  construcao: "Construção e reparos",
  cultura: "Cultura e eventos",
  educacao: "Educação",
  juridico: "Jurídico e contábil",
  logistica: "Logística e transporte",
  saude: "Saúde e bem-estar",
  tecnologia: "Tecnologia",
  outra: "Outra",
} as const;
export type Area = keyof typeof AREAS;

export const CONTRATOS = {
  clt: "CLT",
  pj: "PJ ou MEI",
  estagio: "Estágio",
  temporario: "Temporário",
  freela: "Freela ou projeto",
  bico: "Diária ou bico",
} as const;
export type Contrato = keyof typeof CONTRATOS;

export const MODALIDADES = { presencial: "Presencial", hibrido: "Híbrido", remoto: "Remoto" } as const;
export type Modalidade = keyof typeof MODALIDADES;

export const PERIODOS = { mes: "por mês", hora: "por hora", dia: "por dia", projeto: "por projeto" } as const;
export type Periodo = keyof typeof PERIODOS;

