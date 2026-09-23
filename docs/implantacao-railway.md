# Subir no Railway (teste com webhook público)

O projeto inteiro está descrito em **`.railway/railway.ts`** (Infrastructure as Code do
Railway): **Postgres**, **web** (site, API e webhooks) e **worker** (fila do WhatsApp,
lembrete semanal, pedidos agendados), com as variáveis e as referências entre eles. Web e
worker usam a mesma imagem (`Dockerfile`); só muda o comando. Custo esperado: poucos
dólares por mês neste porte.

O que **não** fica no arquivo, de propósito: os segredos (aparecem como `preserve()`) e o
domínio gerado do Railway. O script abaixo cuida dos dois.

## Criar tudo de uma vez

Pré-requisitos: conta no Railway com o GitHub conectado (acesso a `dodopok/guilda-web`),
[CLI do Railway](https://docs.railway.com/cli) e Node instalados.

```
pnpm install            # instala o pacote "railway", que avalia .railway/railway.ts
bash scripts/railway-setup.sh
```

O script:

1. `railway link` — escolhe ou cria o projeto e o ambiente.
2. `railway config plan` e `railway config apply` — mostra e cria Postgres, web e worker (pede confirmação).
3. Define os segredos do web, lidos sem eco e enviados por stdin:
   - `SECRETS_ENCRYPTION_KEY`, gerada na hora (só se ainda não existir; trocar depois invalida as chaves do WhatsApp salvas);
   - `ESTEVAO_API_KEY`, se você informar;
   - `BOOTSTRAP_ADMIN_PHONE`, `BOOTSTRAP_ADMIN_NAME` e `BOOTSTRAP_ADMIN_PASSWORD` para a primeira administração.
4. Gera o domínio `*.up.railway.app` do web e reimplanta web e worker.

Rodar de novo é seguro: não recria nada que já existe e não troca segredos definidos.

A cada implantação do web, `scripts/predeploy.ts` confere as variáveis obrigatórias (https,
cookie seguro, chave de cifra), aplica as migrações e cria a administração se ainda não
existir. Se faltar algo, para e explica sem alterar nada.

Mudanças posteriores (branch, domínio próprio, novas variáveis) são feitas no arquivo e
aplicadas com `railway config plan` e `railway config apply`.

## Primeiro acesso

1. Abra `https://<domínio>/entrar` e entre com o celular e a senha definidos no script.
2. Apague a senha do bootstrap: `railway variable delete BOOTSTRAP_ADMIN_PASSWORD --service web` (a conta já existe; a senha nunca é sobrescrita).
3. **Nova igreja**: nome, cidade e, em "Quem coordena", **o seu próprio celular** — a conta é ligada direto, sem convite. Siga a configuração inicial.
4. Em Configurações, escolha o **Livro de oração** (lista do Estêvão).

## Webhook do YCloud

1. Na Guilda: **Configurações → Canal do WhatsApp → Oficial via YCloud**. Preencha o número da igreja e a chave de API, deixe **Modo de teste** ligado com só o seu número, e salve.
2. No painel do YCloud: **Developers → Webhooks → Add endpoint**
   - URL: `https://<domínio>/api/v1/webhooks/ycloud`
   - Eventos: `whatsapp.message.updated` e `whatsapp.inbound_message.received`
3. Copie o **segredo do endpoint** mostrado pelo YCloud para "Segredo do webhook" na Guilda e salve.
4. Com o primeiro evento assinado, "Webhook respondendo" fica marcado com o horário do último sinal. Evento sem assinatura válida é recusado (401) e não conta.

Enquanto `WHATSAPP_ALLOW_REAL_SEND=false`, nada sai de verdade, mesmo no modo oficial. Só
troque para `true` (em `.railway/railway.ts`, no web; o worker herda) depois de registrar a
**coexistência** e com os **modelos aprovados**, e mantenha o modo de teste até conferir a
primeira mensagem no seu celular.

## Domínio próprio

Em `.railway/railway.ts`, descomente `domains: ['guilda.anglicanaporto.com.br']` no web e
troque `APP_BASE_URL` para `https://guilda.anglicanaporto.com.br`; aplique com
`railway config apply`. Crie o CNAME que `railway domain status guilda.anglicanaporto.com.br`
mostrar e atualize a URL do webhook no YCloud.

## Observações

- Migrações rodam a cada implantação, antes da troca de versão; são idempotentes.
- Ative backups no Postgres do Railway antes de colocar dados reais.
- `railway.json` / `railway.toml` (Config as Code) estão descontinuados pelo Railway e não são usados aqui.
