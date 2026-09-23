# Decisões e perguntas em aberto

## Decidido na conversa

- Vue e Nuxt 4 para a interface.
- Só a equipe coordenadora monta e altera escalas.
- Uma folga por mês para voluntários é meta de cuidado, não regra obrigatória; pastores não entram nesse alerta.
- Substituição efetivada quando o candidato aceita, sem aprovação adicional.
- Existem grupos de WhatsApp com comunicação manual. O primeiro lançamento deve enviar lembrete semanal individual automaticamente, em dia e horário configuráveis, para todas as pessoas escaladas. Confirmação por mensagem pode vir depois.
- O primeiro lançamento também deve incluir confirmação e troca de tarefas no web app, roteiro de liturgia revisável/publicável e integração com o Estêvão.
- O Estêvão fornece coletas, leituras, celebrações, cores e datas. O roteiro deve permitir edição; ritos como confissão e eucaristia precisam de modelos e conteúdo próprios da igreja.
- Os modelos dos ritos combinarão os roteiros Porto e o material litúrgico da igreja, com revisão da coordenação.
- O LOC é o documento digital usado para os ritos. A coordenação cadastra as partes necessárias e pode editá-las quando um culto exigir variação; os roteiros Porto servem de exemplos de estrutura e uso.
- Os telefones serão cadastrados manualmente pela coordenação; ainda é preciso registrar consentimento para mensagens individuais automáticas.
- As músicas ficam visíveis no app, com aviso individual às pessoas do louvor envolvidas no culto.
- A Guilda deve poder atender outras igrejas no futuro; Porto será a primeira comunidade. O modelo de dados e as permissões precisam separar igrejas desde o início.
- Hoje a equipe coordenadora prepara a escala, os pastores confirmam a liturgia, e normalmente quem prega escolhe as músicas; às vezes a escolha fica com os pastores.
- No app, a revisão pastoral do roteiro será informal e não bloqueará a publicação pela coordenação.
- A cada publicação da escala, a coordenação escolherá se envia também um aviso imediato por WhatsApp às pessoas escaladas.
- O roteiro publicado ficará disponível no app e terá exportação para compartilhamento manual; envio automático do roteiro não faz parte do primeiro lançamento.
- Cada participante criará sua própria senha para entrar no web app.
- Hoje a coordenação pede no começo de cada mês que as pessoas informem datas em que não poderão servir, fixa um prazo de resposta e procura deixar a escala pronta até quarta ou quinta-feira antes do primeiro culto do mês.
- No primeiro lançamento, a mensagem mensal de disponibilidade levará ao app, onde a pessoa marcará os cultos em que não pode servir. Para isso, a coordenação cadastrará antes todos os cultos previstos para o mês. A mensagem poderá sair no começo do mês.
- Se o primeiro culto do mês cair cedo, a coordenação pode antecipar essa mensagem para o fim do mês anterior.
- Um participante só pode propor como substituto alguém habilitado para a mesma função. A coordenação pode designar excepcionalmente outra pessoa.
- Se uma escala mudar depois de um lembrete, o app avisará automaticamente as pessoas afetadas pela mudança.
- Cada pessoa receberá um convite individual pelo WhatsApp para criar sua conta e definir a própria senha.
- Os roteiros Porto de 24/05/2026 e 27/04/2025 são intencionalmente curtos.
- Cada lembrete reúne as tarefas da pessoa em todos os cultos dos sete dias seguintes ao disparo.
- A igreja já tem um número que usa o aplicativo WhatsApp Business, e ele precisa continuar funcionando no aplicativo após a automação. Ainda é preciso validar um caminho oficial que permita isso.
- Limpeza também está na planilha, embora não apareça em todos os meses.
- Limpeza está em retomada: varrer o quintal, organizar cadeiras e ajudar na área do café; horário de chegada ainda precisa ser definido.
- O culto dominical habitual começa às 9h30; datas litúrgicas especiais podem ter cultos adicionais.
- Recomendação técnica inicial: um repositório para Nuxt/Nitro e PostgreSQL; estevao-api permanece serviço separado.
- A API da Guilda deve poder atender um futuro cliente Flutter, com contrato HTTP independente da interface Vue.

## A confirmar antes das respectivas etapas

| Tema | Pergunta | Encaminhamento provisório |
| --- | --- | --- |
| Participação | Quem deve receber ao menos uma tarefa por mês? | Alertar apenas para habilitados e disponíveis, sem bloqueio. |
| Folga | Contar só domingos regulares ou também outros dias de culto? Como identificar pastores e outras exceções? | Domingo regular como referência inicial; campo de tipo pastoral e exceção configurável. |
| Coleta de disponibilidade | Qual dia/horário e prazo de resposta escolher em cada mês? | Normalmente no começo do mês; pode antecipar para o fim do mês anterior quando o primeiro culto cair cedo. |
| Prazos | Até quando cada pessoa confirma a escala publicada? | Coordenação define prazo; meta de publicação até quarta ou quinta antes do primeiro culto. |
| Cultos | Quais horários e funções dos cultos extras em datas litúrgicas? | Domingo habitual às 9h30; modelo permite vários cultos. |
| Música | Há aprovação formal do grupo de louvor antes de publicar o repertório? | Quem prega escolhe normalmente; pastores podem assumir; repertório no app e aviso individual ao louvor. |
| Acesso | Como registrar o consentimento para convites e mensagens automáticas? | Telefones cadastrados manualmente pela coordenação; convite individual com link de uso único. |
| Outras igrejas | O primeiro lançamento deve permitir cadastro de outras igrejas ou só preparar a estrutura para isso? | Isolamento de dados desde a base; Porto é a primeira comunidade. |
| Outras igrejas | Cada igreja terá seu número WhatsApp, modelos de liturgia e configurações? Como será o cadastro inicial? | Proposta: configurações e canal próprios por igreja; validar antes de abrir o produto. |
| WhatsApp | O número do app Business pode usar a API oficial mantendo o uso no aplicativo? Quem administra a conta e qual o volume semanal? | Investigar na descoberta e fazer teste antes do primeiro lançamento; manter o uso no aplicativo é requisito. |
| Lembrete | Qual dia/horário local e conteúdo final da mensagem? | Uma configuração geral para a igreja; uma mensagem por pessoa com todas as tarefas dos próximos sete dias. Mudanças posteriores geram aviso automático aos afetados. |
| Limpeza | Que horário exato de chegada e frequência são viáveis na retomada? | Manter função ativa com horário a definir. |
| Importação | Trazer histórico ou apenas pessoas e mês corrente? | Prévia de um mês e revisão manual. |
| Estêvão/LOC | URL, chave, versão e direitos de exibição e redistribuição dos textos para outras igrejas? | Teste de contrato e verificação dos direitos antes de abrir o produto. |

Essas respostas refinam políticas e integrações, sem exigir outro modelo de dados.
