# Descoberta — viabilidade do WhatsApp automático

## Estado conhecido

- A igreja usa um número no aplicativo WhatsApp Business.
- Esse número precisa continuar funcionando no aplicativo depois da integração.
- O primeiro lançamento exige um lembrete individual semanal automático para todas as pessoas escaladas, em dia e horário configuráveis.
- O lembrete reúne os cultos dos sete dias seguintes ao disparo.
- Confirmação por botão ou resposta recebida no WhatsApp não é exigida nesse lançamento.

O aplicativo WhatsApp Business e a Plataforma do WhatsApp Business são produtos distintos na [política oficial](https://business.whatsapp.com/policy/preview?lang=pt_BR). Portanto, o uso atual do aplicativo não comprova que o número já pode enviar mensagens pela API. A [Cloud API oficial](https://www.postman.com/meta/whatsapp-business-platform/overview) é a interface a validar para os envios automáticos.

## Prova técnica necessária

1. Identificar quem administra o portfólio empresarial da Meta e o número institucional, sem registrar credenciais no repositório.
2. Verificar a elegibilidade do número atual no fluxo oficial de [integração de usuários do aplicativo Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), chamado de coexistência, e confirmar que ele permanece utilizável no aplicativo. Não executar uma migração que desative o aplicativo.
3. Conferir requisitos de conta, modelo de mensagem, destinatário de teste, custos e limites vigentes diretamente no painel da conta.
4. Criar um modelo de lembrete com dados mínimos e submetê-lo à aprovação do canal.
5. Enviar uma mensagem de teste a uma pessoa que concordou em recebê-la; registrar id, estado e eventual falha.
6. Simular o agendamento semanal e um reprocessamento para provar que não há duplicata.
7. Confirmar processo de consentimento e cancelamento dos lembretes. A [política oficial](https://business.whatsapp.com/policy/preview?lang=pt_BR) exige consentimento para contato e modelos aprovados para iniciar conversas.

## Resultado esperado da descoberta

Uma decisão registrada sobre a integração do número atual, quem administra a configuração, aprovação do modelo, custo estimado conforme o volume real e evidência de um envio de teste com o aplicativo ainda funcional. Até esse teste, a integração permanece **planejada**, não validada.

Não pedir ou guardar tokens, senhas, telefones completos ou listas de contatos nos documentos do repositório.
