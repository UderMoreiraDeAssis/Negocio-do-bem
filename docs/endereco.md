# Endereço e localização (#158)

Este documento descreve a implementação parcial no [PR #168, em rascunho](https://github.com/fabsreis/Negocio-do-bem/pull/168), até o commit `e46f4d7`: preenchimento manual, persistência, apresentação, busca por nomes de subdivisões e consulta opcional de CEP. Não significa que essas mudanças estejam publicadas.

O objetivo é atender ao Brasil inteiro. A lista do DF resolve um caso específico, mas ainda não constitui uma identificação nacional de localidades. A [proposta de localização nacional e evolução da busca](busca-e-localizacao.md) discute código IBGE, confirmação dos dados postais, preferência de cidade e comparação entre PostgreSQL e Apache Solr, separando implementação de próximos passos.

## Modelo e apresentação

- `cidade` e `uf` continuam vindo da lista municipal do IBGE. No DF são Brasília/DF; `regiaoAdministrativa` guarda separadamente uma região da lista do GDF. `bairro` e `localidade` são campos opcionais, também para o restante do Brasil.
- `cep`, `logradouro`, `numero` e `complemento` são opcionais. O CEP é texto para preservar zeros iniciais. Número aceita letras e `s/n`; quadra, conjunto, bloco, setor, trecho e lote cabem em logradouro/complemento. Endereço rural sem logradouro ou CEP continua válido.
- Os detalhes postais começam com `enderecoPublico=false`. A indicação não pode alterar essa regra, mesmo enviando o campo à mão ou marcando que é do dono. Somente a ação de edição, após conferir o vínculo de dono ou papel de moderação, permite publicar. É uma proposta conservadora para o ponto de privacidade aberto na issue, a ser revisada no PR.
- Bairro, região e localidade são públicos e pesquisáveis. O texto de busca não contém detalhes postais. Perfil e JSON-LD só expõem detalhes postais autorizados. A prévia em imagem continua mostrando município/UF.
- `CamposEndereco` usa os componentes e tokens existentes, e o envio segue `enviarSemLimpar`. Os campos são controles HTML comuns e não dependem de uma API postal.

## Regiões administrativas

Lista em `src/lib/regioes-df.ts`, conferida em 30/10/2026. Referências:

- [Administrações regionais — Segov/GDF](https://segov.df.gov.br/category/administracoes-regionais/).
- [Documento orientador da Sema/GDF, com a relação das 35 regiões anteriores](https://www.sema.df.gov.br/documents/6196895/38822454/Documento-Orientador.pdf).
- [GDF: sanção das regiões 26 de Setembro e Ponte Alta em 2026](https://www.gdfsaude.df.gov.br/web/guest/w/celina-sanciona-leis-que-criam-as-ras-da-26-de-setembro-e-de-ponte-alta).
- [Lei 7.917/2026, Ponte Alta — SINJ/GDF](https://www.sinj.df.gov.br/sinj/DetalhesDeNorma.aspx?id_norma=c47f63aae6cd4a15afab43209ccef723).

A lista contém 37 regiões, incluindo as duas criadas em 2026. Ao atualizar, conferir os atos oficiais, preservar valores já gravados e testar a validação. Não acrescentar regiões a `municipios.json`. Não inferir região de um CEP ou do nome Brasília.

## Busca e compatibilidade

O campo `Onde?` aceita nomes de regiões e sugestões `Bairro — Município, UF`. A consulta compara grafias sem acentos e maiúsculas, mas restringe município e UF quando informados. Uma pesquisa sem qualificação pode abranger homônimos; as sugestões permitem escolher o lugar exato. Municípios têm preferência sobre subdivisões de mesmo nome quando a pessoa não especifica a UF.

As contagens municipais e páginas `/cidades` continuam agrupando só cidade/UF. As contagens das subdivisões usam apenas negócios publicados e contam uma vez um nome repetido em mais de um campo do mesmo negócio. Os demais filtros e suas contagens usam a mesma condição de localização.

A migração `20261030181540_endereco_completo` só adiciona colunas opcionais e o booleano com padrão falso. Não renomeia nem remove colunas, não muda endereços existentes e não atribui detalhes desconhecidos. O `busca` anterior continua correto porque todos os detalhes novos começam nulos; cada indicação/edição calcula o texto completo. Portanto, não há atualização em massa nesta migração.

## Consulta de CEP

Decisão registrada em 30/10/2026: usar o [ViaCEP](https://viacep.com.br/) como fonte da integração opcional. A regra completa está em [Regras de negócio](regras-de-negocio.md) (seção 3); o código, em `src/lib/cep.ts` e `src/app/api/cep/route.ts`. Liga com `CEP_CONSULTA=viacep`; sem a variável, permanece desligada.

**Por que o ViaCEP.** A fonte documenta consulta gratuita nacional e distingue CEP não encontrado por `erro`. A implementação aceita tanto `true` quanto `"true"`; falhas técnicas não são gravadas como inexistência. Isso não torna a integração uma API oficial dos Correios nem garante cobertura completa ou disponibilidade. A alternativa contratual dos Correios e os critérios de evolução estão na [proposta nacional](busca-e-localizacao.md).

**Cuidados com o ViaCEP.** A página do serviço avisa que uso massivo para validar bases locais pode bloquear o acesso por tempo indeterminado. Por isso:

- não há atualização em lote nem varredura de CEPs: uma cópia só é revalidada quando alguém usa aquele CEP, depois de 90 dias;
- cotas definidas pelo projeto e no banco, valendo para todas as instâncias: 20 chamadas por minuto e 1.000 por dia ao ViaCEP, e 20 consultas por origem a cada 10 minutos na nossa rota. Esses valores não são cotas publicadas ou contratadas com o provedor;
- uma chamada por consulta, com 4 segundos de limite e sem nova tentativa; consultas iguais ao mesmo tempo podem compartilhar a chamada dentro da mesma instância;
- depois de falha, pausa compartilhada de 1 minuto, dobrando até 1 hora, ou o `Retry-After` (até 24 horas), com até 20% a mais ao acaso;
- a consulta só começa com o CEP completo e meio segundo depois da última tecla;
- identificação própria no `User-Agent`, como na consulta de CNPJ.

**Integração direta.** O código usa `fetch` no servidor, sem biblioteca de consulta postal. Cache, cotas e pausa pertencem ao aplicativo. Uma eventual troca de biblioteca ou provedor exige nova avaliação; ela não resolve por si só identidade territorial e qualidade da busca.

**Cópia local.** `CepConsultado` guarda o CEP, a situação da consulta e os dados disponíveis do ViaCEP (UF, cidade, bairro, logradouro), a fonte e a data, nunca número, complemento ou dado de negócio. Falhas não apagam a cópia anterior. Um resultado encontrado vale 90 dias; na indisponibilidade externa, pode ser usado até 365 dias, marcado como informação a confirmar. Resultado inexistente vale 7 dias. Esses são prazos de uso/revalidação: não há rotina de exclusão automática dos registros nem política de retenção concluída.

A atualização postal não regrava os endereços dos negócios: sugere campos vazios no formulário. No DF, `montarEndereco` reconhece um nome da lista do GDF quando ele corresponde ao bairro inteiro ou ao trecho final entre parênteses. Não há correspondência por prefixo. O código ainda descarta o `ibge` retornado pelo provedor. Esses limites motivam a proposta nacional, sem ampliar heurísticas específicas de uma UF.

**Limites conhecidos.** A unificação de consultas iguais vale dentro de cada instância; cache e cotas compartilhados não garantem uma única chamada simultânea entre instâncias. A documentação consultada do ViaCEP não estabelece autorização expressa de retenção, cotas numéricas ou SLA; essas condições continuam em aberto. Apagar a cópia postal não altera os cadastros.

## Coordenação e validação

Pendências do rascunho em 30/10/2026: revisar visibilidade e condições de cache; validar concorrência entre instâncias e falha do armazenamento; obter liberação das checagens e do preview. Ativação depende de configuração e aplicação das migrações pelo fluxo de entrega do projeto. A #158 permanece em atendimento, sem declaração de conclusão.

O PR #145 ainda estava aberto quando esta branch partiu de `stage`. Os campos ficam em `CamposEndereco` para que o cadastro por etapas possa reaproveitá-los; a integração atual é em `/indicar`. Se #145 entrar primeiro, resolver o encaixe na etapa de localização e manter os mesmos campos/validação no servidor.

[Captura do formulário no celular, com dados fictícios](prints/endereco-celular.png).

Os testes de unidade e PostgreSQL cobrem formato, limites, DF/TO, endereços rurais, autorização para editar/publicar, preservação após erros, busca sem acentos, contagens, cadastros antigos e não exposição de detalhes privados na busca e no JSON-LD. Os testes da consulta de CEP (`tests/unit/cep.test.ts` e `tests/db/cep.test.ts`) simulam o ViaCEP: cópia válida e vencida, idade máxima, inexistente com prazo curto, erro 500, resposta inválida, rede fora do ar, `429` com `Retry-After`, pausa progressiva, cotas por origem e geral e consultas simultâneas.

No teste exploratório com JavaScript desabilitado, o Next manteve o conteúdo transmitido por streaming em um contêiner oculto, tanto em `/indicar` quanto em `/entrar` (rota não alterada). Não foi possível validar o envio sem JavaScript pela interface; este PR não modifica a estratégia de renderização do aplicativo.
