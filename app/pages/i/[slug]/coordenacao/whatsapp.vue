<script setup lang="ts">
useHead({ title: 'Canal do WhatsApp' })
const route = useRoute()
const { capi, tz, info } = useChurch()
const toast = useToast()

interface TemplateRow { kind: string, label: string, defaultName: string, body: string, params: string[], name: string, language: string, status: string }
interface Channel {
  mode: 'disabled' | 'simulation' | 'cloud_api' | 'ycloud'
  phoneNumberId: string | null
  senderPhone: string | null
  businessAccountId: string | null
  displayPhoneLast4: string | null
  hasAccessToken: boolean
  hasAppSecret: boolean
  hasWebhookVerifyToken: boolean
  coexistence: { status: string, note: string | null, verifiedAt: string | null }
  testMode: boolean
  testRecipients: string[]
  templates: TemplateRow[]
  readiness: { realSendAllowedByServer: boolean, hasCredentials: boolean, hasWebhookSecret: boolean, coexistenceVerified: boolean, approvedTemplates: string[], canSendReal: boolean }
  encryptionReady: boolean
}
const { data, refresh } = await useAsyncData(`wa-${route.params.slug}`, () => capi<Channel>('/whatsapp'))

const form = reactive({ phoneNumberId: '', senderPhone: '', businessAccountId: '', displayPhoneLast4: '', accessToken: '', appSecret: '', webhookVerifyToken: '', testMode: true, testRecipients: '' })
watchEffect(() => {
  const c = data.value
  if (!c) return
  Object.assign(form, { phoneNumberId: c.phoneNumberId ?? '', senderPhone: c.senderPhone ?? '', businessAccountId: c.businessAccountId ?? '', displayPhoneLast4: c.displayPhoneLast4 ?? '', testMode: c.testMode, testRecipients: c.testRecipients.join('\n'), accessToken: '', appSecret: '', webhookVerifyToken: '' })
})
async function patch(body: Record<string, unknown>, msg = 'Configuração salva.') {
  try {
    await capi('/whatsapp', { method: 'PATCH', body })
    toast.ok(msg)
    await refresh()
    if (info.value && 'mode' in body) info.value.whatsappMode = body.mode as Channel['mode']
  } catch (e) {
    toast.error(e)
  }
}
// O formulário de credenciais segue o provedor escolhido; sem provedor real, mostra o YCloud.
const provider = computed<'ycloud' | 'cloud_api'>(() => (data.value?.mode === 'cloud_api' ? 'cloud_api' : 'ycloud'))
async function saveCredentials() {
  const body: Record<string, unknown> = provider.value === 'ycloud'
    ? { senderPhone: form.senderPhone || null }
    : { phoneNumberId: form.phoneNumberId || null, businessAccountId: form.businessAccountId || null, displayPhoneLast4: form.displayPhoneLast4 || null }
  Object.assign(body, {
    testMode: form.testMode,
    testRecipients: form.testRecipients.split(/[\n,]/).map((x) => x.trim()).filter(Boolean),
  })
  if (form.accessToken) body.accessToken = form.accessToken
  if (form.appSecret) body.appSecret = form.appSecret
  if (form.webhookVerifyToken) body.webhookVerifyToken = form.webhookVerifyToken
  await patch(body, 'Credenciais salvas (cifradas no servidor).')
}
const coex = reactive({ note: '' })
async function setCoex(status: 'verified' | 'not_verified') {
  try {
    await capi('/whatsapp/coexistence', { method: 'PUT', body: { status, note: coex.note } })
    toast.ok(status === 'verified' ? 'Comprovação registrada.' : 'Comprovação desfeita.')
    coex.note = ''
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function setTemplate(t: TemplateRow, patchT: Partial<TemplateRow>) {
  await patch({ templates: { [t.kind]: { name: patchT.name ?? t.name, language: patchT.language ?? t.language, status: patchT.status ?? (t.status === 'not_submitted' ? 'not_submitted' : t.status) } } }, 'Modelo atualizado.')
}
const webhookUrl = computed(() => {
  const path = `/api/v1/webhooks/${provider.value === 'ycloud' ? 'ycloud' : 'whatsapp'}`
  return import.meta.client ? `${window.location.origin}${path}` : path
})
const checks = computed(() => {
  const c = data.value
  if (!c) return []
  const y = provider.value === 'ycloud'
  return [
    { ok: c.mode === 'cloud_api' || c.mode === 'ycloud', text: 'Canal oficial escolhido para esta igreja (YCloud ou Cloud API)' },
    { ok: c.readiness.hasCredentials, text: y ? 'Número da igreja e chave de API do YCloud cadastrados' : 'Identificador do número e token de acesso cadastrados' },
    { ok: c.readiness.hasWebhookSecret, text: y ? 'Segredo do webhook do YCloud cadastrado (confere a assinatura dos eventos)' : 'App secret cadastrado (confere a assinatura dos webhooks)' },
    { ok: c.readiness.coexistenceVerified, text: 'Coexistência comprovada: o número continua funcionando no aplicativo WhatsApp Business' },
    { ok: c.readiness.approvedTemplates.includes('weekly_reminder'), text: 'Modelo do lembrete semanal aprovado na Meta' },
    { ok: c.readiness.realSendAllowedByServer, text: 'Envio real liberado no servidor (WHATSAPP_ALLOW_REAL_SEND=true)' },
  ]
})
async function copy(text: string) {
  await navigator.clipboard?.writeText(text)
  toast.ok('Copiado.')
}
function varList(params: string[]) {
  return params.map((p, i) => `${'{'.repeat(2)}${i + 1}${'}'.repeat(2)} ${p}`).join(' · ')
}
const TSTATUS: Record<string, string> = { not_submitted: 'Não enviado', pending: 'Em análise', approved: 'Aprovado', rejected: 'Rejeitado' }
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Comunicação
      </p>
      <h1>Canal do WhatsApp</h1>
      <p class="lede">
        Cada igreja usa o próprio número. Mensagens só saem para quem autorizou, e o envio real só liga depois de comprovar que o número continua no aplicativo WhatsApp Business.
      </p>
    </div>
    <template v-if="data">
      <section>
        <div class="section-head">
          <h2>Modo</h2>
        </div>
        <fieldset style="margin-top:.5rem">
          <legend class="sr-only">
            Modo do canal
          </legend>
          <div class="choice-list">
            <label class="check"><input
              type="radio"
              name="mode"
              :checked="data.mode === 'disabled'"
              @change="patch({ mode: 'disabled' })"
            ><span class="check__text"><strong>Desativado</strong><span
              class="small muted"
              style="display:block"
            >Nada é enviado. Mensagens ficam registradas como “não enviadas”.</span></span></label>
            <label class="check"><input
              type="radio"
              name="mode"
              :checked="data.mode === 'simulation'"
              @change="patch({ mode: 'simulation' })"
            ><span class="check__text"><strong>Simulação local</strong> <span class="tag tag--sim">não envia</span><span
              class="small muted"
              style="display:block"
            >Para testes: o fluxo inteiro roda e as mensagens aparecem como simuladas. Ninguém recebe nada.</span></span></label>
            <label class="check"><input
              type="radio"
              name="mode"
              :checked="data.mode === 'ycloud'"
              @change="patch({ mode: 'ycloud' })"
            ><span class="check__text"><strong>Canal oficial pelo YCloud</strong><span
              class="small muted"
              style="display:block"
            >Número conectado no YCloud por coexistência. Envio real só quando todos os itens ao lado estiverem cumpridos.</span></span></label>
            <label class="check"><input
              type="radio"
              name="mode"
              :checked="data.mode === 'cloud_api'"
              @change="patch({ mode: 'cloud_api' })"
            ><span class="check__text"><strong>Canal oficial direto na Meta (Cloud API)</strong><span
              class="small muted"
              style="display:block"
            >Para quem tem app próprio na Meta. Mesmas exigências para o envio real.</span></span></label>
          </div>
        </fieldset>
      </section>

      <div class="split section">
        <div>
          <section>
            <div class="section-head">
              <h2>Credenciais</h2>
            </div>
            <p
              v-if="!data.encryptionReady"
              class="notice notice--no"
              style="margin-top:.75rem"
            >
              O servidor está sem SECRETS_ENCRYPTION_KEY: não é possível guardar tokens.
            </p>
            <form
              style="margin-top:1rem"
              @submit.prevent="saveCredentials"
            >
              <template v-if="provider === 'ycloud'">
                <label class="field"><span class="field__label">Número da igreja no WhatsApp</span><input
                  v-model="form.senderPhone"
                  class="input"
                  type="tel"
                  autocomplete="off"
                  placeholder="+55 51 99999-9999"
                ><span class="field__hint">O mesmo número conectado no YCloud. As mensagens saem dele.</span></label>
                <label class="field"><span class="field__label">Chave de API do YCloud</span><input
                  v-model="form.accessToken"
                  class="input"
                  type="password"
                  autocomplete="off"
                  :placeholder="data.hasAccessToken ? 'Guardada — preencha só para trocar' : 'Em Developers → API Keys, no painel do YCloud'"
                ></label>
                <label class="field"><span class="field__label">Segredo do webhook</span><input
                  v-model="form.appSecret"
                  class="input"
                  type="password"
                  autocomplete="off"
                  :placeholder="data.hasAppSecret ? 'Guardado — preencha só para trocar' : 'Mostrado ao criar o endpoint de webhook no YCloud'"
                ></label>
                <p class="field__hint">
                  URL do webhook para cadastrar no YCloud (eventos <code>whatsapp.message.updated</code> e <code>whatsapp.inbound_message.received</code>): <code>{{ webhookUrl }}</code> <button
                    type="button"
                    class="btn btn--quiet btn--small"
                    @click="copy(webhookUrl)"
                  >
                    Copiar
                  </button>
                </p>
              </template>
              <template v-else>
                <div class="fields-2">
                  <label class="field"><span class="field__label">Phone number ID</span><input
                    v-model="form.phoneNumberId"
                    class="input"
                    inputmode="numeric"
                    autocomplete="off"
                  ></label>
                  <label class="field"><span class="field__label">WhatsApp Business Account ID</span><input
                    v-model="form.businessAccountId"
                    class="input"
                    inputmode="numeric"
                    autocomplete="off"
                  ></label>
                </div>
                <label class="field"><span class="field__label">Últimos 4 dígitos do número (para exibição)</span><input
                  v-model="form.displayPhoneLast4"
                  class="input"
                  style="max-width:8rem"
                  inputmode="numeric"
                  maxlength="4"
                ></label>
                <label class="field"><span class="field__label">Token de acesso</span><input
                  v-model="form.accessToken"
                  class="input"
                  type="password"
                  autocomplete="off"
                  :placeholder="data.hasAccessToken ? 'Guardado — preencha só para trocar' : 'Cole o token do usuário do sistema'"
                ></label>
                <label class="field"><span class="field__label">App secret</span><input
                  v-model="form.appSecret"
                  class="input"
                  type="password"
                  autocomplete="off"
                  :placeholder="data.hasAppSecret ? 'Guardado — preencha só para trocar' : ''"
                ></label>
                <label class="field"><span class="field__label">Token de verificação do webhook</span><input
                  v-model="form.webhookVerifyToken"
                  class="input"
                  type="password"
                  autocomplete="off"
                  :placeholder="data.hasWebhookVerifyToken ? 'Guardado — preencha só para trocar' : 'Invente um texto longo e use o mesmo na Meta'"
                ></label>
                <p class="field__hint">
                  URL do webhook para cadastrar na Meta: <code>{{ webhookUrl }}</code> <button
                    type="button"
                    class="btn btn--quiet btn--small"
                    @click="copy(webhookUrl)"
                  >
                    Copiar
                  </button>
                </p>
              </template>
              <label
                class="check"
                style="margin-top:1rem"
              ><input
                v-model="form.testMode"
                type="checkbox"
              ><span class="check__text"><strong>Modo de teste</strong><span
                class="small muted"
                style="display:block"
              >Envio real só para os números abaixo, um por linha.</span></span></label>
              <textarea
                v-if="form.testMode"
                v-model="form.testRecipients"
                class="textarea"
                style="min-height:4rem"
                aria-label="Números de teste"
                placeholder="+55 51 99999-9999"
              />
              <button
                class="btn btn--primary"
                style="margin-top:1rem"
              >
                Salvar credenciais
              </button>
              <p
                class="small muted"
                style="margin-top:.5rem"
              >
                Tokens ficam cifrados no banco e nunca voltam para o navegador.
              </p>
            </form>
          </section>

          <section class="section">
            <div class="section-head">
              <h2>Modelos de mensagem</h2>
            </div>
            <p
              class="ink-2"
              style="margin-top:.75rem"
            >
              Cadastre estes textos como modelos da categoria “utilidade”, em português ({{ provider === 'ycloud' ? 'no YCloud, em WhatsApp → Templates' : 'no gerenciador da Meta' }}), com o mesmo nome, e marque aqui quando forem aprovados.
            </p>
            <ul
              class="lines"
              style="margin-top:1rem"
            >
              <li
                v-for="t in data.templates"
                :key="t.kind"
              >
                <div class="line">
                  <span class="line__main"><span class="line__title">{{ t.label }}</span> <code class="small">{{ t.name }}</code></span>
                  <label
                    class="sr-only"
                    :for="`ts-${t.kind}`"
                  >Situação de {{ t.label }}</label>
                  <select
                    :id="`ts-${t.kind}`"
                    class="select"
                    style="width:auto;min-height:2.25rem;padding:.2rem .5rem"
                    :value="t.status"
                    @change="setTemplate(t, { status: ($event.target as HTMLSelectElement).value })"
                  >
                    <option
                      v-for="(l, k) in TSTATUS"
                      :key="k"
                      :value="k"
                    >
                      {{ l }}
                    </option>
                  </select>
                </div>
                <p
                  class="small ink-2"
                  style="margin-top:.35rem"
                >
                  {{ t.body }}
                </p>
                <p class="small muted">
                  Variáveis: {{ varList(t.params) }} <button
                    type="button"
                    class="btn btn--quiet btn--small"
                    @click="copy(t.body)"
                  >
                    Copiar texto
                  </button>
                </p>
              </li>
            </ul>
          </section>
        </div>

        <aside>
          <div class="section-head">
            <h2>Para enviar de verdade</h2>
          </div>
          <ol class="steps">
            <li
              v-for="(c, i) in checks"
              :key="i"
            >
              <span
                class="steps__mark"
                :class="{ 'steps__mark--done': c.ok }"
                :aria-label="c.ok ? 'cumprido' : 'pendente'"
              ><Icon
                v-if="c.ok"
                name="check"
              /></span>
              <span class="small">{{ c.text }}</span>
            </li>
          </ol>
          <p
            class="notice"
            :class="data.readiness.canSendReal ? 'notice--ok' : 'notice--wait'"
            style="margin-top:1rem"
          >
            {{ data.readiness.canSendReal ? (data.testMode ? 'Pronto para envio real, só para os números de teste.' : 'Envio real ligado para quem autorizou.') : 'Envio real bloqueado até completar a lista.' }}
          </p>

          <div
            class="section-head"
            style="margin-top:2rem"
          >
            <h2>Coexistência</h2>
          </div>
          <p
            class="small"
            style="margin-top:.6rem"
          >
            O número atual precisa continuar funcionando no aplicativo WhatsApp Business. Isso exige a conexão por coexistência (no YCloud, “conectar número já usado no aplicativo WhatsApp Business”). Não conecte o número de outra forma: a migração comum desativa o aplicativo. Antes de registrar, envie uma mensagem de teste e confirme que o aplicativo continua recebendo e enviando no mesmo número.
          </p>
          <p
            v-if="data.coexistence.status === 'verified'"
            class="notice notice--ok small"
            style="margin-top:.75rem"
          >
            Comprovada em {{ dateTime(data.coexistence.verifiedAt!, tz) }}: {{ data.coexistence.note }}
          </p>
          <label
            class="field"
            style="margin-top:.75rem"
          ><span class="field__label">Como foi comprovado</span><textarea
            v-model="coex.note"
            class="textarea"
            style="min-height:4.5rem"
            placeholder="Ex.: em 12/10, após conectar por coexistência, enviamos uma mensagem de teste pela Guilda e respondemos pelo aplicativo no mesmo número."
          /></label>
          <div class="row">
            <button
              v-if="data.coexistence.status !== 'verified'"
              type="button"
              class="btn btn--small"
              :disabled="coex.note.trim().length < 10"
              @click="setCoex('verified')"
            >
              Registrar comprovação
            </button>
            <button
              v-else
              type="button"
              class="btn btn--small btn--no"
              :disabled="coex.note.trim().length < 10"
              @click="setCoex('not_verified')"
            >
              Desfazer comprovação
            </button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
