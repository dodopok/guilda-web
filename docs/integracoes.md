# Integrações

## Estêvão API e LOC REB 2027

No código local do estevao-api, o livro REB 2027 usa o código loc_2027 e está marcado como external_only. Calendário e lecionário estão disponíveis para consumidores externos com X-API-Key; ofícios diários completos ainda não aparecem como disponíveis. A integração da Guilda precisa validar o contrato na instância real antes de implementá-lo. As preferências litúrgicas e escolhas ficam ligadas à igreja que prepara o culto.

| Informação | Endpoint observado |
| --- | --- |
| Nome do dia, semana, cor, festa, coleta, leituras | GET /api/v1/calendar/:year/:month/:day |
| Referências de leituras | GET /api/v1/lectionary/:year/:month/:day |
| Explicação da seleção litúrgica | GET /api/v1/liturgical_explanation/:year/:month/:day, se permitido para a chave |

Enviar preferences[prayer_book_code]=loc_2027 e demais preferências exigidas pelo contrato. O servidor busca, valida e mostra sugestões à coordenação; ela escolhe as leituras usadas e para quem vão. Salvar referência, texto quando houver direito de exibição, coleta, cor, festa, origem e instante da captura. Não sobrescrever roteiro publicado após atualização remota. Se a API falhar, permitir preenchimento manual. Essa integração faz parte do primeiro lançamento. O Estêvão não fornece ritos como confissão e eucaristia nem as falas completas da liturgia; esses blocos vêm de modelos editáveis mantidos pela igreja.

Antes de implementar: confirmar URL, chave, parâmetros, cobertura de datas, estrutura de collect/readings, direitos dos textos bíblicos e festas transferidas. A resposta mensal da API é compacta e não contém as leituras do dia.

## WhatsApp individual automático: requisito do primeiro lançamento

O primeiro lançamento deve enviar um lembrete semanal individual, em dia e horário configuráveis, a todas as pessoas escaladas para os cultos dos sete dias seguintes ao disparo. Uma pessoa com várias tarefas recebe uma mensagem consolidada. O app mostra quem recebeu, quem ficou pendente e por quê. Botão de confirmação e interpretação de respostas no WhatsApp são etapas posteriores.

A igreja já usa um número no aplicativo WhatsApp Business, que precisa continuar funcionando nesse aplicativo. Isso ainda não confirma que ele esteja habilitado para envio pela plataforma/API; a viabilidade de integrar o número atual mantendo seu uso no aplicativo deve ser testada na descoberta. A integração deve usar um canal oficial, consentimento por pessoa, modelos aprovados quando aplicáveis, custos controlados, reenvios idempotentes e opção de parar mensagens. A [política oficial do WhatsApp Business](https://business.whatsapp.com/policy/preview?lang=pt_BR) distingue o aplicativo da plataforma, exige consentimento para contato e modelos aprovados para iniciar conversas pela plataforma.

Os grupos atuais continuam úteis para anúncios gerais. A integração com grupos existentes exige prova técnica própria; não é pré-requisito das confirmações individuais. Não assumir que uma API pode ler ou publicar nos grupos atuais.

O fluxo inicial registra escala/versão, janela, destinatário e estado de entrega. A etapa posterior de confirmação poderá receber resposta por webhook; respostas ambíguas pedem nova confirmação. Uma resposta antiga a uma escala alterada não pode confirmar o novo posto.

## Roteiro, músicas e avisos

O roteiro é produzido no app, revisto informalmente pelos pastores e publicado pela coordenação. O LOC fornece o material digital dos ritos; a coordenação cadastra as partes necessárias e edita exceções do culto. Normalmente quem prega escolhe as músicas; em alguns cultos os pastores assumem essa escolha. O repertório fica no app e gera aviso individual às pessoas do louvor envolvidas no culto. O roteiro publicado fica disponível no app e pode ser exportado para compartilhamento manual. Avisos têm dono, ordem e estado. O envio automático do roteiro e a publicação direta no grupo de louvor ficam para avaliação posterior e dependem de prova técnica do canal de grupos.

## Segredos e dados

Chaves e tokens ficam no servidor. Registrar consentimento, finalidade, canal, data e revogação. Links individuais expiram e não expõem dados de terceiros. Logs omitem conteúdo sensível e números completos.
