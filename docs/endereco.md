# Endereço e localização (#158)

Esta entrega cobre o preenchimento manual, a persistência, a apresentação e a busca por subdivisões. **Não encerra a #158:** consulta de CEP, cache persistente e atualização postal dependem da definição da fonte e das condições de uso. O comentário de início na issue propõe essas partes em entregas separadas.

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

## Consulta postal pendente

Não foi habilitado provedor, criada tabela de cache, rotina agendada ou credencial. O formulário aceita o endereço manual. CEP com formato válido não é anunciado como existente nem como localização comprovada.

Na pesquisa de 30/10/2026:

- Os [termos públicos da BrasilAPI](https://brasilapi.com.br/#termos-de-uso) ainda se dizem em elaboração, proíbem varredura/crawling e orientam volume correspondente a consultas humanas. Não publicam uma cota numérica contratual nem esclarecem os direitos de retenção de uma base postal local. A [licença MIT](https://github.com/BrasilAPI/BrasilAPI/blob/main/LICENSE) trata do software; não foi tomada como autorização de redistribuição da base.
- O [endpoint CEP v1](https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/api/cep/v1/%5Bcep%5D.js) converte `service_error` em `NotFoundError`. Assim, um `404` desse endpoint, sozinho, não basta para concluir que um CEP não foi encontrado sem falha técnica. A integração precisará distinguir esses casos.
- A API dos Correios exige a definição do acesso comercial, conforme a referência da issue ao [manual de Busca CEP](https://www.correios.com.br/atendimento/developers/manuais/manual-api-busca-cep).

Antes da próxima entrega, definir a fonte, os direitos de armazenamento e os parâmetros operacionais. Com esses dados, implementar a política da issue: cache persistente com fonte/datas, revalidação e idade máxima, atualização limitada e retomável, cotas e concorrência compartilhadas, unificação de consultas iguais, respeito a `Retry-After`, pausas em falhas e preenchimento manual sem perda de dados. A atualização postal nunca deve regravar os endereços informados pelas pessoas.

## Coordenação e validação

O PR #145 ainda estava aberto quando esta branch partiu de `stage`. Os campos ficam em `CamposEndereco` para que o cadastro por etapas possa reaproveitá-los; a integração atual é em `/indicar`. Se #145 entrar primeiro, resolver o encaixe na etapa de localização e manter os mesmos campos/validação no servidor.

[Captura do formulário no celular, com dados fictícios](prints/endereco-celular.png).

Os testes de unidade e PostgreSQL cobrem formato, limites, DF/TO, endereços rurais, autorização para editar/publicar, preservação após erros, busca sem acentos, contagens, cadastros antigos e não exposição de detalhes privados na busca e no JSON-LD. Testes de falha, cota e recuperação do provedor postal ficam para a entrega da integração.

No teste exploratório com JavaScript desabilitado, o Next manteve o conteúdo transmitido por streaming em um contêiner oculto, tanto em `/indicar` quanto em `/entrar` (rota não alterada). Não foi possível validar o envio sem JavaScript pela interface; este PR não modifica a estratégia de renderização do aplicativo.
