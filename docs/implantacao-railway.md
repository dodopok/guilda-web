# Subir no Railway (teste com webhook público)

Três serviços no mesmo projeto: **Postgres**, **web** (site + API + webhooks) e **worker**
(fila do WhatsApp, lembrete semanal, pedidos agendados). Web e worker usam a mesma imagem
(`Dockerfile`); só muda o comando. Custo esperado: poucos dólares por mês neste porte.

A configuração fica no repositório:

| Arquivo | Serviço | O que faz |
|---|---|---|
| `railway.json` | web | Build pelo Dockerfile; antes de trocar a versão roda `scripts/predeploy.ts` (confere variáveis, aplica migrações, cria a primeira administração); saúde em `/api/v1/health` |
| `railway.worker.json` | worker | Mesma imagem, comando `tsx worker/index.ts`, reinício sempre |

## 1. Projeto e banco

1. Em railway.com: **New Project → Deploy from GitHub repo** → `dodopok/guilda-web`, branch `claude/fervent-brown-l9uyi1` (ou `main`, depois do merge). O primeiro serviço criado é o **web**; renomeie para `web`.
2. No projeto: **+ New → Database → PostgreSQL**.
3. No `web`: **Settings → Networking → Generate Domain** (gera `algo.up.railway.app`).

## 2. Variáveis do web

Em **web → Variables** (as referências `${{…}}` o Railway resolve sozinho):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
SESSION_COOKIE_SECURE=true
SECRETS_ENCRYPTION_KEY=<gere abaixo>
WHATSAPP_ALLOW_REAL_SEND=false
ESTEVAO_API_URL=https://api.caminhoanglicano.com.br
ESTEVAO_API_KEY=<sua chave do Estêvão>
BOOTSTRAP_ADMIN_PHONE=<seu celular, ex.: +5551999999999>
BOOTSTRAP_ADMIN_NAME=<seu nome>
BOOTSTRAP_ADMIN_PASSWORD=<senha forte, 12+ caracteres>
```

Gere a chave de cifra no seu computador (guarde-a: sem ela, as chaves do WhatsApp salvas não podem ser lidas):

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Se faltar algo obrigatório (https, cookie seguro, chave de cifra), o `predeploy` para e explica — nada é alterado.

## 3. Worker

1. **+ New → GitHub Repo** → o mesmo repositório e branch. Renomeie para `worker`.
2. **Settings → Config-as-code → Railway config file**: `railway.worker.json`.
3. Sem domínio público. **Variables**:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_BASE_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
SECRETS_ENCRYPTION_KEY=${{web.SECRETS_ENCRYPTION_KEY}}
WHATSAPP_ALLOW_REAL_SEND=${{web.WHATSAPP_ALLOW_REAL_SEND}}
```

O worker é quem de fato envia as mensagens; ele lê a mesma chave de cifra e a mesma trava de envio real do web.

## 4. Primeiro acesso

1. Abra `https://<domínio>/entrar` e entre com o celular e a senha do `BOOTSTRAP_ADMIN_*`.
2. Apague `BOOTSTRAP_ADMIN_PASSWORD` das variáveis (a conta já existe; a senha nunca é sobrescrita).
3. **Nova igreja**: nome, cidade e, em "Quem coordena", **o seu próprio celular** — assim a conta é ligada direto, sem convite. Siga a configuração inicial.
4. Em Configurações, escolha o **Livro de oração** (lista do Estêvão).

## 5. Webhook do YCloud

1. Na Guilda: **Configurações → Canal do WhatsApp → Oficial via YCloud**. Preencha o número da igreja e a chave de API, deixe **Modo de teste** ligado com só o seu número, e salve.
2. No painel do YCloud: **Developers → Webhooks → Add endpoint**
   - URL: `https://<domínio>/api/v1/webhooks/ycloud`
   - Eventos: `whatsapp.message.updated` e `whatsapp.inbound_message.received`
3. Copie o **segredo do endpoint** mostrado pelo YCloud para o campo "Segredo do webhook" na Guilda e salve.
4. Quando o YCloud mandar o primeiro evento assinado, "Webhook respondendo" fica marcado com o horário do último sinal. Evento sem assinatura válida é recusado (401) e não conta.

Enquanto `WHATSAPP_ALLOW_REAL_SEND=false`, nada sai de verdade, mesmo no modo oficial. Só troque para `true` (no web; o worker herda) depois de registrar a **coexistência** e com os **modelos aprovados**, e mantenha o modo de teste até conferir a primeira mensagem no seu celular.

## 6. Domínio próprio (depois)

Em **web → Settings → Networking → Custom Domain**: `guilda.anglicanaporto.com.br`, crie o CNAME indicado no DNS. Depois troque `APP_BASE_URL=https://guilda.anglicanaporto.com.br` e atualize a URL do webhook no YCloud.

## Observações

- Migrações rodam a cada implantação, antes da troca de versão; são idempotentes.
- Backups: ative no serviço Postgres do Railway antes de colocar dados reais.
- Segredos só nas variáveis do Railway — nunca no repositório.
