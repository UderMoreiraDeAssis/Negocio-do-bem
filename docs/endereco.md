# Endereço e localização (#158)

Esta entrega cobre o preenchimento manual, a persistência, a apresentação e a busca por subdivisões. A consulta de CEP está na seção "Consulta de CEP" abaixo.

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

Decisão de 30/10/2026: fonte gratuita, o [ViaCEP](https://viacep.com.br/), com o máximo de cuidado contra abuso. A regra completa está em `docs/regras-de-negocio.md` (seção 3); o código, em `src/lib/cep.ts` e `src/app/api/cep/route.ts`. Liga com `CEP_CONSULTA=viacep`.

**Por que o ViaCEP.** Das fontes gratuitas avaliadas, é a que separa "CEP não existe" de falha: CEP de formato válido e inexistente volta com status 200 e `"erro": "true"`, formato inválido com 400. A [BrasilAPI](https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/api/cep/v2/%5Bcep%5D.js) responde 404 tanto para CEP inexistente quanto para todos os provedores fora do ar, e o cabeçalho de cache de um dia vale também para esse 404. A [API Busca CEP dos Correios](https://api.correios.com.br/cep/v3/api-docs) exige contrato ("Tipo de autorização externa: Contrato"), e o token aceita 3 pedidos por segundo.

**Cuidados com o ViaCEP.** A página do serviço avisa que uso massivo para validar bases locais pode bloquear o acesso por tempo indeterminado. Por isso:

- não há atualização em lote nem varredura de CEPs: uma cópia só é revalidada quando alguém usa aquele CEP, depois de 90 dias;
- cotas pequenas e no banco, valendo para todas as instâncias: 20 chamadas por minuto e 1.000 por dia ao ViaCEP, e 20 consultas por origem a cada 10 minutos na nossa rota;
- uma chamada por consulta, com 4 segundos de limite e sem nova tentativa; consultas iguais ao mesmo tempo esperam a mesma chamada;
- depois de falha, pausa compartilhada de 1 minuto, dobrando até 1 hora, ou o `Retry-After` (até 24 horas), com até 20% a mais ao acaso;
- a consulta só começa com o CEP completo e meio segundo depois da última tecla;
- identificação própria no `User-Agent`, como na consulta de CNPJ.

**Pacotes npm avaliados e não adotados.** `cep-promise` (sem versão desde 02/2024) dispara todos os provedores a cada consulta e usa o endpoint da página pública dos Correios; `@eusilvio/cep-lookup` também consulta todos ao mesmo tempo; `brasil-sdk` tinha 8 dias e licença fora do SPDX; `node-cep-correios` consulta a AwesomeAPI; `brasil-ceps-offline` não tem repositório público. Nenhum faz a cópia local, as cotas e a pausa compartilhadas, que são o que importa aqui; a chamada em si é um `fetch`.

**Cópia local.** `CepConsultado` guarda só o que o ViaCEP devolve publicamente (UF, cidade, bairro, logradouro), a fonte e a data, nunca número, complemento ou dado de negócio. A cópia de um CEP só é substituída por uma resposta válida; falhas não apagam a anterior. A atualização postal nunca regrava os endereços dos negócios: ela só sugere valores para campos vazios no formulário. A região administrativa só é preenchida quando o bairro traz, entre parênteses, um nome da lista do GDF; nunca é deduzida de "Brasília".

**Limites conhecidos.** A unificação de consultas iguais vale dentro de cada instância; entre instâncias, a cópia local e as cotas seguram a repetição. Os termos do ViaCEP não falam explicitamente em guardar as respostas; a cópia é pequena, sob demanda e com revalidação, e pode ser apagada (`CepConsultado`) sem afetar nenhum cadastro.

## Coordenação e validação

O PR #145 ainda estava aberto quando esta branch partiu de `stage`. Os campos ficam em `CamposEndereco` para que o cadastro por etapas possa reaproveitá-los; a integração atual é em `/indicar`. Se #145 entrar primeiro, resolver o encaixe na etapa de localização e manter os mesmos campos/validação no servidor.

[Captura do formulário no celular, com dados fictícios](prints/endereco-celular.png).

Os testes de unidade e PostgreSQL cobrem formato, limites, DF/TO, endereços rurais, autorização para editar/publicar, preservação após erros, busca sem acentos, contagens, cadastros antigos e não exposição de detalhes privados na busca e no JSON-LD. Os testes da consulta de CEP (`tests/unit/cep.test.ts` e `tests/db/cep.test.ts`) simulam o ViaCEP: cópia válida e vencida, idade máxima, inexistente com prazo curto, erro 500, resposta inválida, rede fora do ar, `429` com `Retry-After`, pausa progressiva, cotas por origem e geral e consultas simultâneas.

No teste exploratório com JavaScript desabilitado, o Next manteve o conteúdo transmitido por streaming em um contêiner oculto, tanto em `/indicar` quanto em `/entrar` (rota não alterada). Não foi possível validar o envio sem JavaScript pela interface; este PR não modifica a estratégia de renderização do aplicativo.
