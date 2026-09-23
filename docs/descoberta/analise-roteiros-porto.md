# Descoberta — comparação dos roteiros Porto

Busca feita no Google Drive por documentos com Porto e uma data no título. Foram encontrados **103 documentos distintos**: 96 com título exatamente no formato Porto - dd/mm/aaaa e mais sete com data no título (seis marcados como cópia e um com espaço antes de Porto). Os resultados abrangem 2024 a 2026. Esta análise leu o texto dos 103 documentos e comparou títulos e blocos; não copia falas, nomes ou textos litúrgicos para o repositório.

Os números estruturais abaixo usam os 96 documentos com título no formato regular, para não contar cópias como novos cultos.

## Padrões observados

| Medida | Resultado |
| --- | --- |
| Documentos regulares por ano | 11 em 2024, 49 em 2025, 36 em 2026 |
| Dia da semana da data no título | 92 domingos, dois dias de quinta-feira, uma quarta-feira e um sábado |
| Blocos intitulados Leitura | 24 roteiros com um, 55 com dois, 14 com três, três com quatro |
| Título com ponto de interrogação | 12 documentos; geralmente indica responsável de leitura ainda indefinido |

A estrutura recorrente é abertura/coleta, músicas, confissão, leituras, ofertório, sermão, eucaristia, credo, avisos, bênção e despedida. Absolvição aparece como título separado em todos os 36 documentos de 2026 da amostra, mas não em muitos de 2024/2025. A ausência de um título não prova que a fala ou o rito tenha sido omitido: o texto pode estar dentro de outro bloco. Alguns documentos antigos começam diretamente com Abertura, sem título litúrgico isolado.

## Variações importantes

| Exemplo pelo título no Drive | Variação estrutural observada |
| --- | --- |
| Porto - 01/12/2024, 08/12/2024 e 15/12/2024 | Bloco próprio de vela do Advento. |
| Porto - 05/03/2025 | Observação da Quaresma, imposição de cinzas e litania penitencial em culto de quarta-feira. |
| Porto - 17/04/2025 e 02/04/2026 | Preparação e oração após lava-pés em cultos de quinta-feira. |
| Porto - 25/05/2025 | Litania em bloco próprio. |
| Porto - 14/09/2025 | Instituição e confirmação em blocos próprios. |
| Porto - 01/06/2025 | Festa da Ascensão transferida da quinta-feira para o domingo; título e textos próprios, preservando grande parte da estrutura comum. |
| Porto - 08/06/2025 e 24/05/2026 | Pentecostes em versões estruturalmente diferentes; o roteiro de 2026 termina nos avisos. |

As leituras não seguem cardinalidade fixa, e o sermão pode ter uma referência bíblica distinta das leituras distribuídas a leitores. O modelo deve tratar cada leitura como bloco ordenado com referência, texto/ligação e responsável próprio.

## Anomalias que impedem importação automática dos roteiros

- Existem dois documentos intitulados Porto - 16/03/2025: um segue a ordem dominical comum; outro contém imposição de cinzas e litania, semelhante ao culto de quarta-feira de 05/03/2025. A data/título do segundo precisa de confirmação.
- Porto - 24/05/2026 termina após os avisos; Porto - 27/04/2025 também é bem mais curto que os demais. A igreja confirmou que são liturgias intencionalmente mais curtas. O editor precisa aceitar esse tipo de variação.
- Porto - 28/09/2024 tem data de sábado no título; confirmar se a data ou o tipo de culto está correto.
- Há seis arquivos identificados como Cópia de Porto - data e um com espaço extra no começo do título. Não devem ser tratados automaticamente como versões canônicas.
- Pontos de interrogação no responsável de leitura não devem virar nomes de pessoas nem designações confirmadas.

## Modelo recomendado

1. Um modelo comum versionado com blocos ordenados e textos aprovados.
2. Variações por celebração que inserem, removem ou reordenam blocos: vela, cinzas, lava-pés, litania, confirmação e outros.
3. Campos variáveis para data, título litúrgico, celebrante, pessoas, leituras, coleta, música e avisos.
4. Uma lista aberta de leituras, cada uma com tipo, posição e responsável; sem limite estrutural de duas.
5. Revisão da coordenação antes de publicar ou enviar; conteúdo antigo é referência de descoberta até que a igreja indique a fonte oficial.

Esta comparação justifica um editor de roteiro com modelos e exceções, em vez de gerar um documento rígido a partir das 16 linhas recorrentes da planilha.
