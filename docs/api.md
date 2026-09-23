# API v1

A API em `/api/v1` é o contrato do produto: a interface web a usa e um futuro app Flutter usará a mesma. A especificação completa está em [openapi.json](openapi.json), gerada de `server/api-spec.ts` a partir dos mesmos esquemas Zod que validam as rotas (`pnpm docs:openapi`). Um teste falha se alguma rota existir sem documentação ou vice-versa.

## Convenções

- **JSON** em requisições e respostas. Datas e horas em ISO 8601 (UTC). Meses como `AAAA-MM` e datas locais como `AAAA-MM-DD`, sempre no fuso da igreja (`church.timezone`).
- **Escopo por igreja**: tudo que pertence a uma comunidade fica sob `/api/v1/churches/{church}` (o `slug`). A conta precisa ter vínculo ativo com essa igreja; caso contrário a resposta é **404** (não revelamos se a igreja ou o registro existem). Identificadores de outra igreja também resultam em 404.
- **Papéis**: `coordinator`, `pastor`, `participant`, por igreja. Quem prega em um culto é identificado pela escala (função do tipo sermão). A coluna `x-guilda-access` do OpenAPI indica quem pode chamar cada rota; a regra fina fica no servidor (ex.: participante só responde às próprias tarefas).
- **Erros** sempre no formato:

  ```json
  { "error": { "code": "slot_full", "message": "Texto em português para exibir", "details": {} } }
  ```

  `401` sem sessão · `403` sem permissão · `404` inexistente ou de outra igreja · `409` conflito (versão desatualizada, vaga cheia, troca já resolvida) · `410` link expirado/usado · `422` validação (`details` lista campo e mensagem) · `429` limite de tentativas.
- **Concorrência**: responder a uma tarefa aceita `rowVersion`; se a tarefa mudou desde que foi exibida, a resposta é `409 stale_assignment`. Trocas e designações usam travas de linha no banco.
- **Idempotência**: envios (lembretes, avisos, convites) têm chave única por igreja; repetir a operação não duplica mensagens. Criar domingos do mês e importar a mesma planilha também são idempotentes.

## Autenticação

| Cliente | Como entrar | Como enviar a sessão |
| --- | --- | --- |
| Web | `POST /api/v1/auth/login` com `{ login, password }` | Cookie `guilda_session` (httpOnly, SameSite=Lax, Secure em produção). Escritas exigem cabeçalho `Origin` igual ao endereço do app (proteção CSRF) |
| App nativo | `POST /api/v1/auth/login` com `client: "native"` | `Authorization: Bearer <token>` (token devolvido no corpo; não há cookie) |

O login é o celular em formato E.164 (números brasileiros sem +55 são aceitos). Contas são criadas somente por convite: `GET /api/v1/invites/{token}` mostra a igreja e o primeiro nome; `POST /api/v1/invites/{token}/accept` cria a senha (ou vincula a conta existente mediante a senha dela) e já devolve a sessão. Recuperação: `POST /api/v1/password-reset/request` (resposta sempre igual) e `POST /api/v1/password-reset/confirm`.

Sessões duram `SESSION_TTL_DAYS` (30). Trocar a senha ou redefini-la encerra as outras sessões; `DELETE /api/v1/auth/sessions` encerra as dos outros aparelhos.

## Principais recursos

| Área | Rotas |
| --- | --- |
| Início do participante | `GET me/home`, `GET me/tasks`, `GET me/swaps`, `PUT me/consent` |
| Confirmação e troca | `POST assignments/{id}/respond`, `GET assignments/{id}/candidates`, `POST assignments/{id}/swaps`, `POST swaps/{id}/accept\|reject\|cancel` |
| Indisponibilidade | `GET/PUT me/availability/{month}`; coordenação: `GET availability/{month}`, `PUT .../request`, `POST .../send-now`, `POST .../notify-new` |
| Cadastro | `people`, `people/{id}/qualifications`, `people/{id}/consent`, `people/{id}/invite`, `catalog`, `ministries`, `duties`, `import/preview`, `import/apply` |
| Cultos e escala | `services`, `services/sundays`, `services/{id}/slots`, `slots/{id}/assignments`, `schedule/{month}` (editor), `schedule/{month}/publish`, `schedule/{month}/published`, `schedule/{month}/history`, `assignments/{id}/reassign` |
| Mensagens | `messages`, `messages/{id}/resend`, `messages/{id}/simulated`, `reminders`, `whatsapp`, `whatsapp/coexistence` |
| Liturgia | `templates`, `scripts/{serviceId}` (+ `/blocks`, `/publish`, `/versions`, `/export`, `/liturgical-data`, `/music`), `songs` |
| Webhook | `GET/POST /api/v1/webhooks/whatsapp` (assinatura `X-Hub-Signature-256` obrigatória) |

## Para o cliente Flutter

- Gere o cliente Dart a partir de `docs/openapi.json` (por exemplo com `openapi-generator` para `dart-dio`).
- Use `client: "native"` no login e no aceite do convite; guarde o token no armazenamento seguro do sistema.
- Links recebidos pelo WhatsApp apontam para `APP_BASE_URL` (`/convite/{token}`, `/i/{igreja}/tarefas`, `/i/{igreja}/disponibilidade/{mês}`, `/i/{igreja}/roteiros/{culto}`); o app pode registrá-los como deep links.
- Mudanças incompatíveis exigirão `/api/v2`; campos novos podem aparecer em v1 sem aviso, então ignore campos desconhecidos.
