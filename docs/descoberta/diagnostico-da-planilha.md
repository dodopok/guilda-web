# Descoberta — diagnóstico da planilha e do roteiro

Leitura realizada a partir da planilha de escalas fornecida na conversa e do roteiro Porto - 20/09/2026. Os números abaixo descrevem a amostra observada; não avaliam disponibilidade, compromisso ou justiça da escala. Os links do Drive e dados pessoais não são registrados neste repositório público.

## Estrutura encontrada

- A aba CONFIGURAÇÕES lista nove ministérios e 19 pessoas distintas depois de normalizar espaços e acentos. Uma pessoa pode pertencer a vários ministérios.
- A aba SETEMBRO  2026 contém quatro domingos, 16 rótulos de função por domingo e 78 designações individuais quando células com vários nomes são separadas.
- Todas as 19 pessoas da aba CONFIGURAÇÕES aparecem em pelo menos um domingo dessa amostra. Três aparecem nos quatro domingos. Ainda não há identificação suficiente para saber se alguma delas é pastor ou se declarou indisponibilidade.
- No mesmo domingo, uma pessoa pode constar em até seis designações. Isso confirma a necessidade de ver todas as funções por pessoa e distinguir sequência aceitável de conflito real de horário.
- Em setembro, Limpeza não aparece entre os postos, mas está na aba CONFIGURAÇÕES e nas escalas de março e abril de 2026. A coordenação confirmou que tenta retomar essa escala e descreveu tarefas próprias; a ausência em setembro não a desativa.

| Aba | Datas/blocos observados | Postos por domingo | Ponto de atenção |
| --- | --- | --- | --- |
| SETEMBRO  2026 | 06, 13, 20 e 27/09 | 16 | Sermão de 13/09 sem responsável registrado. |
| MARÇO 2026 | Cinco domingos | 17 | Inclui Limpeza. |
| ABRIL 2026 | Quatro domingos | 17 | Inclui Limpeza; equipe de louvor varia de tamanho. |
| DEZEMBRO | Datas de dezembro e janeiro | 17 | Há um bloco inicial 02/02 e dois blocos finais sem responsáveis; ano e intenção precisam de revisão. |

## Instruções guardadas em notas de células

Os rótulos da planilha têm notas repetidas em cada domingo. Há instruções para Holyrics, mídias sociais, café da manhã, sodalício, serviço dominical e lojinha. As notas indicam chegada às 09h para Holyrics e sodalício e às 08h45 para café e serviço dominical. A nota de Limpeza em março repete a de Serviço Dominical, possivelmente por cópia; não deve ser importada como descrição definitiva sem confirmação.

O [catálogo provisório](catalogo-de-funcoes.md) resume as funções e instruções observadas, sempre marcando o que ainda precisa de validação. A [comparação de 103 roteiros Porto](analise-roteiros-porto.md) cobre variações litúrgicas de 2024 a 2026.

## Diferenças entre escala e roteiro

- A planilha usa um posto composto Leitura AT/Salmos com duas pessoas; o roteiro atribui as duas leituras separadamente. A importação não consegue deduzir qual pessoa lerá qual texto.
- O roteiro de 20/09 indica alguém servindo na eucaristia além de quem preside; a linha Eucaristia da escala registra apenas um responsável. O modelo precisa permitir funções litúrgicas adicionais no mesmo bloco.
- Músicas e avisos aparecem no roteiro como conteúdo editorial, não como simples linhas de escala.
- Coleta, leituras, texto fixo e falas de resposta convivem no mesmo documento. Devem virar blocos revisáveis e versionados, não texto gerado uma vez sem controle.

## Inconsistências para tratar na importação

1. A data só está preenchida na primeira linha de cada bloco; precisa ser propagada até o próximo bloco.
2. Algumas células contêm múltiplas pessoas separadas por vírgula.
3. Há pelo menos uma variação de acento para o mesmo nome entre as fontes. A chave de identidade não pode ser a grafia exibida.
4. Há posto vazio que pode significar pendência, decisão de não preencher ou omissão.
5. Algumas notas de função estão copiadas entre ministérios distintos.
6. A aba de dezembro tem datas e blocos que não permitem atribuir ano e intenção com confiança apenas pelo título.
7. A planilha não contém os telefones nem o consentimento necessários para lembretes individuais automáticos.

## Consequências para o produto

- Prévia de importação com revisão humana de nomes, funções, datas, responsáveis e notas.
- Identidades estáveis para pessoas e funções; exibir grafia preferida sem usá-la como identificador.
- Postos e designações separados; permitir número variável de integrantes.
- Funções litúrgicas detalhadas, ligadas a blocos do roteiro e a leituras específicas.
- Regra de folga como alerta informativo para voluntários, após classificar pastores.
- Cadastro de contato e consentimento feito em canal apropriado, fora do repositório.

## Ainda falta validar

- Horário exato de chegada e frequência desejada para Limpeza durante a retomada.
- Horários dos cultos extras de datas litúrgicas; o domingo habitual começa às 9h30.
- Um roteiro de celebração especial para comparar com o domingo comum.
- Critério de participação para quem está habilitado em vários ministérios.
