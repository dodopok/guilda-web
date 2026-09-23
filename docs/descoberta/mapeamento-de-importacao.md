# Descoberta — mapeamento preliminar de importação

## Origem e destino

| Origem | Transformação proposta | Destino |
| --- | --- | --- |
| Cabeçalhos da aba CONFIGURAÇÕES | Criar ministérios; tratar células abaixo como candidaturas de habilitação. | Ministério, Pessoa, Habilitação |
| Primeira coluna DATA do bloco mensal | Propagar data às linhas seguintes até o próximo bloco; confirmar ano. | Culto |
| MINISTÉRIO, rótulo simples | Normalizar grafia e mapear ao catálogo aprovado. | Função/Posto |
| MINISTÉRIO, prefixo LITURGIA | Separar ministério Liturgia e subtipo de função. | Função/Posto |
| VOLUNTÁRIO | Separar nomes por vírgula; resolver pessoa por identidade revisada. | Uma Designação por pessoa |
| Nota da célula de função | Comparar versões e exigir aprovação do texto. | Instrução da Função |
| Roteiro dominical | Usar como referência estrutural, sem inferir todas as funções da escala. | Modelo de Roteiro e Blocos |

## Regras da prévia

- Não modificar a planilha original.
- Mostrar lado a lado valor de origem, interpretação e qualquer ambiguidade.
- Não criar pessoas automaticamente quando o nome não for reconhecido com confiança.
- Não confundir células vazias com ausência deliberada de função.
- Não inferir responsável por leitura individual a partir de Leitura AT/Salmos.
- Não usar o nome como chave técnica; conciliar grafias antes de importar.
- Associar a importação a aba, intervalo e data da captura, para permitir auditoria e repetição sem duplicatas.

## Ordem sugerida

1. Aprovar catálogo de ministérios, funções e instruções.
2. Conciliar identidades com a coordenação.
3. Importar um mês de amostra em ambiente de teste e comparar culto por culto.
4. Corrigir casos ambíguos e só então importar o mês de lançamento.
5. Decidir separadamente se o histórico vale a migração.

Telefones, consentimentos e credenciais de WhatsApp não vêm dessa planilha e não devem ser adicionados a arquivos do repositório.
