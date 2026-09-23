# Etapa 1 — Base do produto

## Objetivo

Criar o app Nuxt 4, banco e permissões para cadastrar pessoas, funções e cultos.

## Trabalho

1. Estruturar interface Vue, API Nitro, tipos compartilhados, migrações e PostgreSQL local.
2. Implementar convite individual pelo WhatsApp com link de uso único para a pessoa criar a própria senha, login, sessão, recuperação de acesso e papéis de coordenação, pastor, pregador e participante conforme as permissões definidas.
3. Cadastrar igrejas, pessoas, contatos inseridos pela coordenação, consentimento de mensagens, ministérios, funções, habilitações, indisponibilidades e cultos. Toda operação deve ficar limitada à igreja autorizada.
4. Permitir vários cultos por dia, horários, locais e funções com mais de uma pessoa.
5. Criar auditoria e importação idempotente com prévia e revisão.
6. Preparar interface móvel em português e configuração de dia, horário e fuso do lembrete semanal.

## Aceite

- Coordenador cria culto e postos; participante só vê o que sua permissão permite.
- Participante não altera escala mesmo chamando a API diretamente.
- Uma coordenação de outra igreja não consegue consultar ou alterar participantes, escalas, roteiros ou contatos de Porto.
- Importação de amostra pode repetir sem duplicar registros e informa linhas ambíguas.
- Datas são calculadas no fuso local correto.
- Cada convite só ativa a conta da pessoa destinatária, expira e não revela dados de outros participantes.

**Próxima etapa:** pessoas, funções e cultos cadastrados.
