# Descoberta — contrato inicial do lembrete semanal

## Decisões já confirmadas

- O primeiro lançamento à igreja deve enviar lembretes automaticamente pelo WhatsApp.
- A coordenação pode configurar dia e horário semanal do envio.
- Todas as pessoas escaladas para os cultos abrangidos recebem lembrete; confirmação pela mensagem não é exigida nesse lançamento.
- A janela é de sete dias seguintes ao disparo, incluindo cultos extras desse período.
- A igreja já usa um número no aplicativo WhatsApp Business e precisa continuar usando esse aplicativo.

## Comportamento proposto para validação

1. A configuração da igreja guarda dia da semana, horário local e fuso. A janela inclui os cultos dos sete dias seguintes ao disparo.
2. No horário agendado, buscar apenas cultos com escala publicada e ainda futuros.
3. Reunir por pessoa todas as tarefas da janela em uma única mensagem, ordenadas por data/hora.
4. Mostrar culto, local, função e horário de chegada aprovado; não usar a hora de início do culto como substituta do horário de chegada.
5. Se não houver telefone válido ou consentimento, não enviar e criar pendência visível à coordenação.
6. Guardar versão da escala, janela, destinatário, id do envio no provedor e estado. Uma nova execução da mesma tarefa não duplica mensagem.
7. Após mudança relevante em uma escala já lembrada, avisar automaticamente as pessoas afetadas com correção ou cancelamento, sem reenviar para quem não foi afetado. Usar a nova versão da escala para evitar aviso duplicado.
8. Se não houver pessoa escalada na janela, registrar execução sem destinatários.

## Rascunho de conteúdo

> Olá, {nome}! Lembrete da sua escala nesta semana: {data e horário do culto}; {função e horário de chegada}. Você pode ver os detalhes em {link}. Se precisar de alteração, avise a coordenação.

Para várias tarefas, repetir os itens no resumo da mesma mensagem. O texto é apenas um exemplo para revisão; o modelo final depende das regras e da aprovação do canal oficial.

## Casos a testar

- Uma pessoa com várias funções no mesmo domingo recebe uma mensagem consolidada.
- Duas pessoas com a mesma função recebem mensagens individuais.
- Pessoa sem consentimento aparece como pendência, sem envio.
- Reprocessamento, fuso horário e falha temporária do provedor não geram duplicação.
- Alteração após o lembrete não deixa a pessoa com instrução antiga sem aviso.
- Função com horário de chegada indefinido não inventa esse horário.

## Dependências abertas

- Dia/horário inicial desejado.
- Confirmação do texto final da mensagem e da forma de apresentar correções/cancelamentos.
- Habilitação do número atual para uma integração oficial que preserve seu uso no aplicativo.
- Contatos e consentimentos dos participantes, fora da planilha de escalas e do repositório.

Ver também a [etapa de entrega dos lembretes](../etapas/03-lembretes.md).
