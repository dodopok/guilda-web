# Etapa 3 — Lembretes automáticos por WhatsApp

## Objetivo

Cumprir o requisito do primeiro lançamento: enviar, sem ação semanal da coordenação, um lembrete individual a todas as pessoas escaladas para os próximos cultos, em dia e horário configuráveis. Confirmar presença pela mensagem não é necessário nesta etapa.

## Preparação obrigatória

1. Validar uma integração oficial que permita automatizar o envio pelo número atual e manter o uso desse número no aplicativo WhatsApp Business.
2. Obter e registrar o consentimento de cada pessoa para receber lembretes de escala, com opção de parar o envio.
3. Aprovar o modelo de mensagem exigido pelo canal e testar com número de desenvolvimento.
4. Configurar dia da semana, horário local e fuso; incluir os cultos dos sete dias seguintes ao disparo.

## Trabalho no app

1. Construir uma lista de destinatários a partir da versão publicada da escala; uma pessoa recebe uma mensagem que reúne suas tarefas da janela, inclusive quando ocupa vários postos.
2. Incluir data, culto, local, funções e horário de chegada conhecido, além de link para ver os detalhes no app.
3. Agendar o disparo semanal com idempotência por pessoa, janela e versão, fila/reenvio controlado e registro de entrega ou falha.
4. Mostrar prévia da mensagem, quantidade de destinatários, pessoas sem consentimento/telefone e resultado do disparo à coordenação.
5. Enviar automaticamente correção ou cancelamento às pessoas afetadas quando uma escala já lembrada mudar; não duplicar avisos nem reenviar a quem não foi afetado.
6. Reutilizar o canal oficial para o aviso imediato que a coordenação pode selecionar ao publicar uma escala, sem misturá-lo com o agendamento semanal.
7. Reutilizar o canal para o pedido mensal de indisponibilidades, com link para o app, prazo e idempotência por mês e destinatário.

## Aceite do primeiro lançamento

- A coordenação escolhe dia e horário; um teste em fuso America/Sao_Paulo dispara no instante configurado.
- Todas as pessoas escaladas e aptas a receber mensagem recebem um lembrete individual com todas as suas tarefas da janela; ausências por falta de contato/consentimento aparecem como pendência.
- Ninguém fora da escala publicada recebe lembrete de serviço.
- Repetir o processamento não gera mensagens duplicadas.
- Falha de envio aparece no painel e pode ser tratada sem alterar a escala.
- O envio usa o canal oficial configurado e um modelo de mensagem aprovado quando exigido.
- O número continua disponível no aplicativo WhatsApp Business após a integração.

**Próxima etapa:** respostas e trocas poderão ocorrer pelo app e, depois, pelo WhatsApp.
