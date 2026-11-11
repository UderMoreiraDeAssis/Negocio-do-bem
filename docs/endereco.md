# Endereço e localização (#158)

O endereço é opcional e nacional: município/UF continuam sendo a referência municipal do IBGE; bairro, distrito/localidade e região administrativa ficam separados. O DF é um dos casos cobertos, sem transformar suas regiões em municípios. A entrega do [PR #168](https://github.com/fabs-reis/Negocio-do-bem/pull/168) inclui cadastro, edição, perfil, busca e consulta postal opcional.

## Cadastro e privacidade

`CamposEndereco` é usado na etapa de localização de `/participar` e na edição pelo dono ou moderação. O cadastro por etapas da `stage` veio do #192, que substituiu o #145. Os campos ficam no rascunho durante o login e os erros do servidor voltam à etapa de localização.

- Só município/UF são obrigatórios. Bairro, localidade, região, CEP, logradouro, número e complemento são opcionais. Número aceita letras e `s/n`; quadra, lote, conjunto e referências cabem nos campos livres. Endereço rural sem CEP permanece válido.
- CEP é texto com oito dígitos, preservando zeros iniciais; a entrada aceita hífen. Município e região são validados no servidor, assim como tamanho e formato dos outros campos.
- Bairro, localidade e região são públicos e pesquisáveis. CEP, logradouro, número e complemento começam privados. Uma indicação não autoriza sua publicação, mesmo quando a pessoa marca que é dona.
- Só dono ou moderação podem marcar `enderecoPublico` na edição. O perfil e o JSON-LD respeitam essa escolha. Detalhes postais nunca entram no texto de busca.
- Cadastros antigos continuam com cidade/UF, sem inferir detalhes desconhecidos. As migrações são aditivas; a busca é recalculada a cada edição. A rotina de corrigir cidades preserva as subdivisões.

## Regiões e busca

A lista `src/lib/regioes-df.ts` contém 37 regiões, conferidas em 30/10/2026 nas [administrações regionais do GDF](https://segov.df.gov.br/category/administracoes-regionais/) e nos atos de criação de [Ponte Alta](https://www.sinj.df.gov.br/sinj/DetalhesDeNorma.aspx?id_norma=c47f63aae6cd4a15afab43209ccef723) e [26 de Setembro](https://www.gdfsaude.df.gov.br/web/guest/w/celina-sanciona-leis-que-criam-as-ras-da-26-de-setembro-e-de-ponte-alta). A atualização deve conferir os atos oficiais e preservar valores gravados. Não alterar `municipios.json` para incluir subdivisões.

O campo Onde aceita sugestões como `Centro — Recife, PE` e `Taguatinga, DF`. A comparação ignora acentos e maiúsculas; município/UF qualificam homônimos. Uma consulta sem qualificação pode abranger vários lugares. Municípios têm preferência sobre subdivisões de mesmo nome. Páginas e contagens municipais continuam agrupando apenas cidade/UF; subdivisões contam somente negócios publicados, uma vez por nome em cada negócio.

## Consulta opcional de CEP

Fonte: [ViaCEP](https://viacep.com.br/), documentação consultada em 05/11/2026. É um serviço gratuito de consulta nacional que distingue formato inválido de CEP não encontrado; não é apresentado como API oficial dos Correios. A fonte adverte contra uso massivo para validar bases locais e não publica cotas numéricas, SLA ou autorização expressa para esta retenção.

Por isso a integração permanece desligada por padrão. Para ativá-la, a manutenção precisa confirmar as condições de armazenamento com a fonte e definir **ambas** as variáveis:

```dotenv
CEP_CONSULTA=viacep
CEP_ARMAZENAMENTO_AUTORIZADO=1
```

A segunda variável registra a decisão operacional; não concede direitos sobre a fonte. Sem qualquer uma delas, a rota responde `desligada`, sem consultar ou armazenar dados do provedor. O cadastro manual funciona normalmente. A aplicação das migrações e a configuração seguem o fluxo de PR/merge; não há deploy manual.

### Preenchimento

A consulta começa meio segundo depois de completar o CEP. Trocar ou apagar o CEP cancela a consulta anterior. Só campos vazios recebem sugestões; número, complemento e correções manuais ficam intactos. Cidade divergente ou município que não foi reconhecido na lista impedem o preenchimento dos demais campos, com aviso para conferir à mão.

No DF, a região é sugerida somente quando o bairro inteiro ou o trecho final entre parênteses corresponde à lista. Não há dedução por prefixo nem a partir de Brasília. Uma resposta incompleta continua permitindo o cadastro manual.

### Cópia, retenção e recuperação

`CepConsultado` guarda somente CEP, situação, UF, município, bairro, logradouro, fonte e data da consulta bem-sucedida. Não guarda número/complemento do estabelecimento, dados pessoais do formulário ou credenciais. A fonte não fornece versão de registro; a data local identifica a consulta.

- Encontrado: revalidar após 90 dias, apenas no uso. Durante falha externa, uma cópia de até 365 dias pode ser sugerida como **a confirmar**.
- Não encontrado: válido por sete dias. Erros de rede, timeout, `429`, autenticação, `5xx` ou respostas inválidas nunca viram inexistência.
- Cópias encontradas com mais de 365 dias e negativas vencidas são excluídas em lotes de até 100, em cada consulta habilitada. É limpeza sob demanda: com a integração desligada, a manutenção deve limpar a tabela se encerrar o uso da fonte. Excluir a cópia não altera endereços de negócios.
- Respostas válidas substituem a cópia atomicamente. Falha de gravação, resposta inválida ou interrupção preservam a última versão íntegra; uma consulta seguinte pode retomar a atualização.
- A consulta nunca regrava dados de negócios. O formulário sugere campos vazios para a pessoa conferir.

### Limites e concorrência

Os limites são escolhas conservadoras do projeto, não cotas garantidas pelo ViaCEP: 20 pedidos por origem em dez minutos e, para o provedor, 20 por minuto e 1.000 por dia. Os contadores ficam no PostgreSQL, compartilhados entre instâncias. Sem IP confiável, as origens dividem a mesma cota. A cota externa é confirmada antes da chamada, mesmo se a gravação da resposta falhar.

Uma trava transacional do PostgreSQL permite somente **uma consulta externa por vez** entre instâncias. Quem não obtém a trava libera a conexão, espera brevemente e relê a cópia antes de tentar a trava de novo, por até cinco segundos. Assim duas consultas ao mesmo CEP reutilizam a resposta. Encerramento ou falha da transação libera a trava; não há trava permanente para recuperar manualmente. A cópia utilizável ou o preenchimento manual atendem quem não puder esperar.

A requisição usa domínio e protocolo fixos (`https://viacep.com.br`), confere os oito dígitos novamente no ponto de saída e codifica o CEP como um único segmento de caminho. Redirecionamentos são recusados.

Cada chamada externa tem timeout de quatro segundos e nenhuma repetição automática. Falhas pausam o provedor por um minuto, dobrando até uma hora; `Retry-After` é aceito até 24 horas, com variação adicional de até 20%. Cache válido continua atendendo durante a pausa. Não há atualização em massa, varredura de CEPs ou rotina que pressione a fonte.

Falha do armazenamento ou da coordenação retorna indisponibilidade (ou uma cópia já lida ainda utilizável) e registra uma mensagem operacional sem CEP, IP, conteúdo do formulário ou erro bruto do banco.

## Validação e evolução

Os testes de unidade e PostgreSQL cobrem DF/TO, bairros homônimos, endereços rurais, cadastros antigos, privacidade, permissões, cota, retenção limitada, indisponibilidade, `429`, timeout, recuperação de gravação e concorrência em processos Node separados. O navegador valida o cadastro por etapas e as respostas atrasadas da consulta com dados fictícios.

Código IBGE persistido, preferência pessoal de localização e motor especializado de busca continuam propostas separadas em [Busca e localização nacional](busca-e-localizacao.md), relacionadas à #139 e à #40. A entrega atual usa nomes municipais validados e busca normalizada no PostgreSQL.
