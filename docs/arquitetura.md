# Arquitetura proposta

## Recomendação

Começar com **um repositório e uma aplicação Nuxt 4**. Vue cuida da interface, rotas Nitro em TypeScript servem a API da Guilda, e PostgreSQL guarda os dados. Um trabalhador de tarefas, no mesmo repositório mas executável separadamente, processa lembretes, webhooks, reenvios e exportações.

O estevao-api continua como serviço separado e fonte de calendário, coletas e leituras. A Guilda é dona de pessoas, cultos, escalas, respostas, escolhas locais e versões do roteiro. Um back-end Rails adicional criaria duas aplicações para manter sem uma necessidade atual. Se o processamento assíncrono crescer, o trabalhador pode ser implantado separadamente sem dividir o código-fonte.

Porto é a primeira igreja, mas outras poderão usar o produto. Desde a base, uma **igreja** é a unidade de isolamento de dados: contas podem participar de mais de uma igreja, porém funções, contatos de voluntariado, escalas, roteiros, consentimentos, modelos locais e configurações pertencem à igreja correspondente. A primeira entrega pode operar só com Porto sem abrir cadastro público de novas igrejas. Ver [plano para múltiplas igrejas](multiplas-igrejas.md).

## Organização sugerida

| Pasta | Responsabilidade |
| --- | --- |
| app/ | Telas Vue da coordenação e dos participantes |
| server/api/ | Rotas autenticadas e webhooks |
| server/services/ | Regras de escala, confirmação e roteiro |
| server/integrations/ | Clientes do Estêvão e WhatsApp |
| shared/ | Tipos e validações compartilhados |
| worker/ | Tarefas agendadas e fila, quando necessárias |

Essa divisão segue a [estrutura oficial do Nuxt 4](https://nuxt.com/docs/4.x/directory-structure/server), que mantém rotas de servidor fora do código da interface.

## Possível app Flutter no futuro

As rotas Nitro são endpoints HTTP que podem devolver JSON a qualquer cliente, inclusive Flutter. O app nativo reaproveitaria banco, regras de escala, autenticação/autorização, integrações com Estêvão e WhatsApp e a API da Guilda. A interface Vue não seria reutilizada; o Flutter teria telas próprias.

Para manter essa opção simples desde a etapa 1:

- Tratar /api/v1 como contrato público do produto, documentado em OpenAPI, com modelos JSON, erros, paginação, datas e versionamento estáveis.
- Manter regras em server/services/, sem depender de componentes Vue, da sessão de renderização ou de estado específico do navegador.
- Projetar autenticação para dois clientes: sessão segura na web e fluxo apropriado para app nativo, com a mesma identidade e autorização no servidor.
- Gerar ou manter um cliente Dart a partir do contrato quando o Flutter começar; tipos TypeScript não são compartilhados diretamente com Dart.
- Fazer testes de contrato dos fluxos centrais para que alterações no Nuxt web não quebrem o app nativo.

Não é necessário separar o back-end em outro repositório só para criar o Flutter. Se surgir necessidade de implantação independente, a API e os serviços podem ser extraídos depois mantendo o contrato HTTP.

## Decisões técnicas

- **Dados:** PostgreSQL e migrações versionadas. Escolher biblioteca de acesso ao banco na etapa 1, após testar o modelo.
- **Acesso:** contas individuais, vínculo e papel por igreja, autorização verificada em cada operação do servidor. Convites pelo WhatsApp têm uso único e senha criada pela pessoa.
- **Isolamento:** toda consulta e alteração de dados locais exige uma igreja autorizada; identificadores de outra igreja não devem ampliar acesso. Testar esse limite na API, tarefas agendadas, exportações e links compartilhados.
- **WhatsApp:** lembrete semanal automático faz parte do primeiro lançamento. Chamadas e futuros webhooks ficam no servidor; chave e tokens nunca no navegador. A configuração do número, consentimentos, modelos e histórico de envios é própria de cada igreja. Respostas futuras devem ser vinculadas ao telefone consentido e à designação correta.
- **Estados:** escala em rascunho/publicada; designação pendente/confirmada/recusada; roteiro em rascunho/revisão/publicado. Publicações têm versões.
- **Horários:** gravar instantes em UTC e calcular o domingo/mês no fuso configurado pela igreja ou pelo culto, inicialmente America/Sao_Paulo para Porto.
- **Auditoria:** registrar autoria e horário de mudanças, confirmações, trocas e envios; não registrar tokens nem telefone completo em logs.
- **Privacidade:** restringir contatos à coordenação e ao serviço de mensagens; definir retenção e exclusão antes do uso real.

## Riscos técnicos que precisam de teste

- Duas confirmações simultâneas não podem colocar duas pessoas no mesmo posto.
- Uma mudança depois da publicação deve invalidar apenas confirmações das tarefas afetadas.
- Falhas externas não impedem consultar a escala publicada.
- Importar dados novamente não duplica pessoas ou designações.
- Webhooks repetidos não aplicam a mesma resposta duas vezes.
- Um link, tarefa agendada ou identificador de outra igreja não pode expor contatos ou conteúdo litúrgico da igreja vizinha.

Separar repositórios só fará sentido diante de uma exigência real de equipe, escala ou implantação independente.
