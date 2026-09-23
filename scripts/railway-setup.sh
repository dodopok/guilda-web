#!/usr/bin/env bash
# Cria (ou atualiza) o projeto da Guilda no Railway a partir de .railway/railway.ts e define
# os segredos uma única vez. Rode na raiz do repositório, com o CLI do Railway instalado:
#   bash scripts/railway-setup.sh
# Segredos são lidos sem eco e enviados por stdin: não ficam no histórico nem no repositório.
set -euo pipefail

command -v railway >/dev/null || { echo "Instale o CLI do Railway: https://docs.railway.com/cli"; exit 1; }
railway whoami >/dev/null 2>&1 || railway login

echo "== 1/4 Projeto: escolha ou crie o projeto e o ambiente (production)"
railway link

echo "== 2/4 Serviços (Postgres, web, worker) a partir de .railway/railway.ts"
railway config plan
railway config apply

has_var() { railway variable list --service web --kv 2>/dev/null | grep -q "^$1="; }
set_secret() { printf '%s' "$2" | railway variable set "$1" --stdin --service web --skip-deploys >/dev/null; echo "  $1 definido"; }

echo "== 3/4 Segredos do serviço web"
if has_var SECRETS_ENCRYPTION_KEY; then
  echo "  SECRETS_ENCRYPTION_KEY já existe (mantida: trocar invalida as chaves do WhatsApp salvas)"
else
  set_secret SECRETS_ENCRYPTION_KEY "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
fi
if ! has_var ESTEVAO_API_KEY; then
  read -rsp "  Chave de API do Estêvão (Enter para pular): " estevao; echo
  [ -n "$estevao" ] && set_secret ESTEVAO_API_KEY "$estevao"
fi
if ! has_var BOOTSTRAP_ADMIN_PHONE; then
  echo "  Primeira administração da plataforma (use o seu celular; depois você cria a igreja com ele):"
  read -rp "  Celular com DDD: " phone
  read -rp "  Seu nome: " name
  while :; do
    read -rsp "  Senha (12+ caracteres): " pass; echo
    [ "${#pass}" -ge 12 ] && break
    echo "  Muito curta."
  done
  set_secret BOOTSTRAP_ADMIN_PHONE "$phone"
  set_secret BOOTSTRAP_ADMIN_NAME "$name"
  set_secret BOOTSTRAP_ADMIN_PASSWORD "$pass"
fi

echo "== 4/4 Domínio público do web"
if railway domain list --service web 2>/dev/null | grep -q "up.railway.app"; then
  railway domain list --service web
else
  railway domain --service web
fi

# Uma única implantação com tudo definido.
railway redeploy --service web --yes >/dev/null 2>&1 || echo "  (Se o web não reimplantar sozinho, use Redeploy no painel.)"
railway redeploy --service worker --yes >/dev/null 2>&1 || true

cat <<'MSG'

Pronto. Próximos passos (docs/implantacao-railway.md):
  1. Abra https://<domínio>/entrar e entre com o celular e a senha que acabou de definir.
  2. Apague a senha do bootstrap:  railway variable delete BOOTSTRAP_ADMIN_PASSWORD --service web
  3. Crie a igreja com você em "Quem coordena" e configure o webhook do YCloud:
     https://<domínio>/api/v1/webhooks/ycloud
Envio real de WhatsApp continua desligado (WHATSAPP_ALLOW_REAL_SEND=false).
MSG
