<script setup lang="ts">
useHead({ title: 'Canal do WhatsApp' })
const route = useRoute()
const { capi, tz, info, link } = useChurch()
const toast = useToast()

type Mode = 'disabled' | 'simulation' | 'cloud_api' | 'ycloud'
interface TemplateRow { kind: string, label: string, defaultName: string, body: string, category: 'UTILITY' | 'AUTHENTICATION', vars: { name: string, label: string, example: string }[], codeExpirationMinutes: number | null, name: string, language: string, status: string }
interface Channel {
  mode: Mode
  lastWebhookAt: string | null
  consents: { people: number, granted: number }
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

const form = reactive({ mode: 'disabled' as Mode, number: '', businessAccountId: '', displayPhoneLast4: '', accessToken: '', appSecret: '', webhookVerifyToken: '', testMode: true, testRecipients: [] as string[] })
const newNumber = ref('')
function load(c: Channel) {
  Object.assign(form, {
    mode: c.mode,
    number: (c.mode === 'cloud_api' ? c.phoneNumberId : c.senderPhone) ?? '',
    businessAccountId: c.businessAccountId ?? '',
    displayPhoneLast4: c.displayPhoneLast4 ?? '',
    testMode: c.testMode,
    testRecipients: [...c.testRecipients],
    accessToken: '',
    appSecret: '',
    webhookVerifyToken: '',
  })
}
watch(data, (c) => c && load(c), { immediate: true })

const official = computed(() => form.mode === 'ycloud' || form.mode === 'cloud_api')
const meta = computed(() => form.mode === 'cloud_api')
const MODES: { id: Mode, label: string, sub: string }[] = [
  { id: 'disabled', label: 'Desligado', sub: 'Nada sai. Só o app.' },
  { id: 'simulation', label: 'Simulação', sub: 'Fica registrado, nada sai.' },
  { id: 'ycloud', label: 'Oficial via YCloud', sub: 'Número da igreja pela YCloud.' },
  { id: 'cloud_api', label: 'Oficial direto com a Meta', sub: 'Sua própria conta na Meta.' },
]
const headline = computed(() => {
  if (form.mode === 'disabled') return { t: 'WhatsApp desligado', s: 'Ninguém recebe mensagem; as pessoas veem tudo só no app.' }
  if (form.mode === 'simulation') return { t: 'Modo de simulação', s: 'Nada sai de verdade. Cada mensagem fica em Mensagens enviadas para você conferir.' }
  if (!data.value?.readiness.canSendReal) return { t: 'Oficial, ainda sem enviar', s: 'Enquanto a lista abaixo não estiver completa, nada sai de verdade.' }
  return form.testMode ? { t: 'Oficial, em modo de teste', s: 'Só os números de teste recebem.' } : { t: 'Oficial, enviando de verdade', s: 'Todo mundo que autorizou recebe.' }
})

const webhookUrl = computed(() => {
  const path = `/api/v1/webhooks/${meta.value ? 'whatsapp' : 'ycloud'}`
  return import.meta.client ? `${window.location.origin}${path}` : path
})
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.ok('Copiado.')
  } catch {
    toast.error('Não consegui copiar. Selecione e copie à mão.')
  }
}
function addNumber() {
  const v = newNumber.value.trim()
  if (!v) return
  if (!normalizePhoneBR(v)) {
    toast.error('Número inválido. Use DDD + número, ex.: (51) 99999-9999.')
    return
  }
  if (!form.testRecipients.some((n) => normalizePhoneBR(n) === normalizePhoneBR(v))) form.testRecipients.push(v)
  newNumber.value = ''
}

const TSTATUS: Record<string, { label: string, bg: string, fg: string }> = {
  approved: { label: 'aprovado', bg: '#e3f3e8', fg: '#155f30' },
  pending: { label: 'em análise', bg: '#fff1d6', fg: '#a86400' },
  rejected: { label: 'rejeitado', bg: '#fde4e0', fg: '#8f2a1e' },
  not_submitted: { label: 'rascunho', bg: '#f0efe9', fg: '#4a5450' },
}
const openTpl = ref<string | null>(null)
const tplStatus = reactive<Record<string, string>>({})
watch(data, (c) => c?.templates.forEach((t) => (tplStatus[t.kind] = t.status)), { immediate: true })
const approved = computed(() => Object.values(tplStatus).filter((s) => s === 'approved').length)

const checklist = computed(() => {
  const c = data.value
  if (!c) return []
  const total = c.templates.length
  return [
    { label: 'Número verificado', sub: official.value ? (c.readiness.hasCredentials ? 'Número e chave cadastrados' : 'Cadastre o número e a chave acima') : 'Escolha um modo oficial', done: official.value && c.readiness.hasCredentials },
    { label: 'Modelos aprovados', sub: `${approved.value} de ${total} aprovados pela Meta`, done: approved.value === total },
    { label: 'Webhook respondendo', sub: !official.value ? 'Precisa de um modo oficial' : c.lastWebhookAt ? `Último sinal: ${stamp(c.lastWebhookAt, tz.value)}` : c.readiness.hasWebhookSecret ? 'Nenhum sinal recebido ainda' : 'Cadastre o segredo do webhook', done: official.value && c.readiness.hasWebhookSecret && Boolean(c.lastWebhookAt) },
    { label: 'Coexistência comprovada', sub: c.readiness.coexistenceVerified ? 'Registrado abaixo' : 'Registre abaixo como foi testado', done: c.readiness.coexistenceVerified },
    { label: 'Autorizações registradas', sub: `${c.consents.granted} de ${c.consents.people} pessoas autorizaram`, done: c.consents.people > 0 && c.consents.granted === c.consents.people, action: 'Ver pessoas', to: link('/coordenacao/pessoas') },
  ]
})
const doneCount = computed(() => checklist.value.filter((c) => c.done).length)

const coexNote = ref('')
watch(data, (c) => (coexNote.value = c?.coexistence.note ?? ''), { immediate: true })
const coexOk = computed(() => data.value?.coexistence.status === 'verified')
async function toggleCoex(v: boolean) {
  if (v && !coexNote.value.trim()) {
    toast.error('Conte antes como testaram: quem mandou, de onde, e se o aparelho continuou recebendo.')
    return
  }
  try {
    await capi('/whatsapp/coexistence', { method: 'PUT', body: { status: v ? 'verified' : 'not_verified', note: coexNote.value } })
    toast.ok(v ? 'Coexistência registrada.' : 'Registro desfeito.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

const saving = ref(false)
async function save() {
  const c = data.value
  if (!c) return
  const body: Record<string, unknown> = { mode: form.mode, testMode: form.testMode, testRecipients: form.testRecipients }
  if (form.mode === 'ycloud') body.senderPhone = form.number || null
  if (form.mode === 'cloud_api') Object.assign(body, { phoneNumberId: form.number || null, businessAccountId: form.businessAccountId || null, displayPhoneLast4: form.displayPhoneLast4 || null })
  if (form.accessToken) body.accessToken = form.accessToken
  if (form.appSecret) body.appSecret = form.appSecret
  if (form.webhookVerifyToken) body.webhookVerifyToken = form.webhookVerifyToken
  const changed = c.templates.filter((t) => tplStatus[t.kind] !== t.status)
  if (changed.length) body.templates = Object.fromEntries(changed.map((t) => [t.kind, { name: t.name, language: t.language, status: tplStatus[t.kind] }]))
  saving.value = true
  try {
    await capi('/whatsapp', { method: 'PATCH', body })
    toast.ok(form.accessToken || form.appSecret ? 'Salvo. As chaves ficam cifradas no servidor.' : 'Salvo.')
    if (info.value) info.value.whatsappMode = form.mode
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stack-lg w-760">
    <PageHead
      title="Canal do WhatsApp"
      lede="Por onde as mensagens da igreja saem."
      :back="link('/coordenacao/configuracoes')"
      back-label="Configurações"
    />
    <template v-if="data">
      <div class="panel--accent">
        <p
          class="caps"
          style="color:inherit;opacity:.85;font-size:12px"
        >
          Agora
        </p>
        <h2 style="font-size:22px;margin-top:2px">
          {{ headline.t }}
        </h2>
        <p style="margin-top:6px;opacity:.92;font-size:15px">
          {{ headline.s }}
        </p>
      </div>

      <div class="card">
        <h2
          id="wa-mode"
          style="font-size:18px;margin-bottom:10px"
        >
          Modo
        </h2>
        <div
          class="modegrid"
          role="radiogroup"
          aria-labelledby="wa-mode"
        >
          <button
            v-for="m in MODES"
            :key="m.id"
            type="button"
            role="radio"
            class="modecard"
            :aria-checked="form.mode === m.id"
            @click="form.mode = m.id"
          >
            <span class="modecard__t">{{ m.label }}</span>
            <span class="modecard__s">{{ m.sub }}</span>
          </button>
        </div>
      </div>

      <div
        v-if="official"
        class="card stack-md"
      >
        <h2 style="font-size:18px">
          {{ meta ? 'Conta na Meta' : 'Conta na YCloud' }}
        </h2>
        <p
          v-if="!data.encryptionReady"
          class="panel panel--no small"
        >
          O servidor está sem SECRETS_ENCRYPTION_KEY: não dá para guardar chaves ainda.
        </p>
        <label class="field">
          <span class="field__label">{{ meta ? 'Identificador do número (Phone number ID)' : 'Número da igreja' }}</span>
          <input
            v-if="meta"
            v-model="form.number"
            class="input"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Somente números"
          >
          <PhoneInput
            v-else
            v-model="form.number"
            autocomplete="off"
          />
        </label>
        <div class="fields-2">
          <label class="field">
            <span class="field__label">{{ meta ? 'Token de acesso' : 'Chave da API' }}</span>
            <input
              v-model="form.accessToken"
              class="input"
              type="password"
              autocomplete="off"
              :placeholder="data.hasAccessToken ? 'guardada — só para trocar' : 'cole aqui'"
            >
          </label>
          <label class="field">
            <span class="field__label">Segredo do webhook</span>
            <input
              v-model="form.appSecret"
              class="input"
              type="password"
              autocomplete="off"
              :placeholder="data.hasAppSecret ? 'guardado — só para trocar' : 'cole aqui'"
            >
          </label>
        </div>
        <details v-if="meta">
          <summary class="link">
            Mais campos da Meta
          </summary>
          <div
            class="fields-2"
            style="margin-top:8px"
          >
            <label class="field"><span class="field__label">WhatsApp Business Account ID</span><input
              v-model="form.businessAccountId"
              class="input"
              inputmode="numeric"
              autocomplete="off"
            ></label>
            <label class="field"><span class="field__label">Final do número (4 dígitos)</span><input
              v-model="form.displayPhoneLast4"
              class="input"
              inputmode="numeric"
              maxlength="4"
            ></label>
          </div>
          <label
            class="field"
            style="margin-top:12px"
          ><span class="field__label">Token de verificação do webhook</span><input
            v-model="form.webhookVerifyToken"
            class="input"
            type="password"
            autocomplete="off"
            :placeholder="data.hasWebhookVerifyToken ? 'guardado — só para trocar' : 'invente um texto longo e use o mesmo na Meta'"
          ></label>
        </details>
        <div>
          <span class="field__label">Endereço do webhook — cole no painel {{ meta ? 'da Meta' : 'da YCloud' }}</span>
          <div
            class="row"
            style="gap:8px"
          >
            <code
              class="mono"
              style="flex:1;min-width:200px;padding:12px 14px;border-radius:12px;background:var(--surface-2);word-break:break-all"
            >{{ webhookUrl }}</code>
            <button
              type="button"
              class="btn btn--secondary btn--sm"
              style="min-height:44px"
              @click="copy(webhookUrl)"
            >
              Copiar
            </button>
          </div>
          <p
            v-if="!meta"
            class="field__hint"
          >
            Eventos: whatsapp.message.updated e whatsapp.inbound_message.received.
          </p>
        </div>
        <SwitchRow
          v-model="form.testMode"
          title="Modo de teste"
          sub="Só os números abaixo recebem."
          boxed
        />
        <div
          v-if="form.testMode"
          class="row"
          style="gap:6px"
        >
          <span
            v-for="(n, i) in form.testRecipients"
            :key="n"
            class="row"
            style="gap:6px;padding:5px 5px 5px 12px;border-radius:999px;background:var(--surface-4);font-weight:700;font-size:13.5px"
          >{{ displayPhone(n) }}<button
            type="button"
            class="icon-btn icon-btn--round icon-btn--sm"
            style="width:24px;height:24px;background:#fff"
            :aria-label="`Tirar ${displayPhone(n)}`"
            @click="form.testRecipients.splice(i, 1)"
          ><Icon
            name="x"
            :weight="2.4"
          /></button></span>
          <PhoneInput
            v-model="newNumber"
            style="width:auto;flex:1 1 150px;min-height:40px;padding:8px 12px;font-size:14.5px"
            aria-label="Novo número de teste"
            @keydown.enter.prevent="addNumber"
          />
          <button
            type="button"
            class="btn btn--line btn--xs"
            style="min-height:40px"
            @click="addNumber"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div class="card">
        <div
          class="row"
          style="gap:10px"
        >
          <h2 style="font-size:18px;flex:1">
            Para enviar de verdade
          </h2>
          <span
            class="stag"
            :style="doneCount === checklist.length ? { background: '#e3f3e8', color: '#155f30' } : { background: '#fff1d6', color: '#a86400' }"
          >{{ doneCount === checklist.length ? 'pronto para ligar' : `${doneCount} de ${checklist.length}` }}</span>
        </div>
        <ul
          style="list-style:none;margin:8px 0 0;padding:0"
        >
          <li
            v-for="c in checklist"
            :key="c.label"
            class="row"
            style="gap:12px;padding:10px 0;border-top:1px solid var(--line-2)"
          >
            <span
              v-if="c.done"
              style="width:26px;height:26px;border-radius:999px;background:var(--ok);color:#fff;display:grid;place-items:center;flex:none"
            ><Icon
              name="check"
              :weight="2.6"
              style="width:14px;height:14px"
              label="feito"
            /></span>
            <span
              v-else
              style="width:26px;height:26px;border-radius:999px;border:2px solid var(--field);flex:none"
            ><span class="sr-only">pendente</span></span>
            <span style="flex:1;min-width:180px">
              <span
                class="strong"
                style="display:block;font-weight:700"
              >{{ c.label }}</span>
              <span
                class="muted"
                style="display:block;font-size:13.5px"
              >{{ c.sub }}</span>
            </span>
            <NuxtLink
              v-if="c.action"
              :to="c.to!"
              class="link"
              style="font-size:13.5px"
            >{{ c.action }}</NuxtLink>
          </li>
        </ul>
        <p
          v-if="!data.readiness.realSendAllowedByServer"
          class="small muted"
          style="margin-top:6px"
        >
          Além disso, o servidor só libera envio real com WHATSAPP_ALLOW_REAL_SEND=true — hoje está desligado.
        </p>
      </div>

      <div class="card stack-md">
        <h2 style="font-size:18px">
          Coexistência com o celular da igreja
        </h2>
        <p
          class="soft"
          style="font-size:14.5px;margin-top:-4px"
        >
          O mesmo número continua no aparelho. Registre como testaram.
        </p>
        <textarea
          v-model="coexNote"
          class="textarea"
          style="min-height:84px;resize:vertical"
          aria-label="Como testaram a coexistência"
          placeholder="Ex.: 20/09 — mandamos “teste” pelo app e a resposta chegou no celular da secretaria."
          :disabled="coexOk"
        />
        <SwitchRow
          :model-value="coexOk"
          title="Comprovado"
          boxed
          @update:model-value="toggleCoex"
        >
          <template #sub>
            <span
              v-if="coexOk"
              class="small"
              style="display:block;color:#155f30;font-weight:700"
            >Registrado{{ data.coexistence.verifiedAt ? ` · ${stamp(data.coexistence.verifiedAt, tz)}` : '' }}</span>
            <span
              v-else
              class="small muted"
              style="display:block"
            >Marque quando o teste funcionar.</span>
          </template>
        </SwitchRow>
      </div>

      <div class="card card--flush">
        <div
          class="row"
          style="gap:10px;padding:16px 18px 8px"
        >
          <h2 style="font-size:18px;flex:1">
            Modelos de mensagem
          </h2>
          <span
            class="soft"
            style="font-size:13.5px"
          >{{ approved }} de {{ data.templates.length }} aprovados</span>
        </div>
        <div
          v-for="t in data.templates"
          :key="t.kind"
        >
          <button
            type="button"
            class="listrow"
            style="border-top:1px solid var(--line-2)"
            :aria-expanded="openTpl === t.kind"
            @click="openTpl = openTpl === t.kind ? null : t.kind"
          >
            <span style="flex:1;min-width:0">
              <span
                class="strong"
                style="display:block"
              >{{ t.label }}</span>
              <span
                class="muted"
                style="display:block;font-size:13px"
              >{{ t.category === 'AUTHENTICATION' ? 'Autenticação · código de 6 dígitos' : `Utilidade · ${t.vars.map((x) => x.name).join(', ')}` }}</span>
            </span>
            <span
              class="stag"
              :style="{ background: TSTATUS[tplStatus[t.kind]!]?.bg, color: TSTATUS[tplStatus[t.kind]!]?.fg }"
            >{{ TSTATUS[tplStatus[t.kind]!]?.label }}</span>
            <Icon
              :name="openTpl === t.kind ? 'chevron-up' : 'chevron-down'"
              class="listrow__chev"
            />
          </button>
          <div
            v-if="openTpl === t.kind"
            class="stack-sm"
            style="padding:0 16px 14px"
          >
            <div
              class="bubble"
              style="background:#e7f6e4;border-radius:18px 18px 18px 4px;max-width:none;white-space:pre-wrap"
            >
              {{ t.body }}
            </div>
            <p
              v-if="tplStatus[t.kind] === 'rejected'"
              style="font-size:13.5px;color:#8f2a1e;font-weight:700"
            >
              A Meta rejeitou este modelo. Confira categoria e variáveis acima e envie de novo com o texto atual.
            </p>
            <dl class="tplmeta">
              <dt>Nome</dt>
              <dd><code class="mono">{{ t.name }}</code></dd>
              <dt>Categoria</dt>
              <dd>{{ t.category === 'AUTHENTICATION' ? 'Autenticação (Authentication)' : 'Utilidade (Utility)' }}</dd>
              <dt>Idioma</dt>
              <dd>Português (BR) · pt_BR</dd>
            </dl>
            <template v-if="t.category === 'AUTHENTICATION'">
              <p class="small">
                No YCloud, escolha <strong>Authentication</strong> e o tipo de código <strong>Copy code</strong>. O texto é o padrão da Meta: não tem link nem variável para escrever. Marque <strong>Add security recommendation</strong> e <strong>Code expiration</strong> com {{ t.codeExpirationMinutes }} minutos. Exemplo de código: <code class="mono">{{ t.vars[0]?.example }}</code>.
              </p>
            </template>
            <template v-else>
              <p class="small">
                Tipo de variável <strong>nome</strong> (não número). Cadastre cada uma com o exemplo:
              </p>
              <table class="tplvars">
                <thead>
                  <tr>
                    <th scope="col">
                      Variável
                    </th>
                    <th scope="col">
                      Exemplo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="x in t.vars"
                    :key="x.name"
                  >
                    <td><code class="mono">{{ x.name }}</code><span class="muted"> · {{ x.label }}</span></td>
                    <td>{{ x.example }}</td>
                  </tr>
                </tbody>
              </table>
              <button
                type="button"
                class="link"
                style="font-size:13.5px;align-self:flex-start"
                @click="copy(t.body)"
              >
                Copiar texto do corpo
              </button>
            </template>
            <div
              class="chips"
              role="radiogroup"
              :aria-label="`Situação de ${t.label}`"
            >
              <button
                v-for="(s, k) in TSTATUS"
                :key="k"
                type="button"
                role="radio"
                class="chip"
                :aria-checked="tplStatus[t.kind] === k"
                :aria-pressed="tplStatus[t.kind] === k"
                @click="tplStatus[t.kind] = k"
              >
                {{ s.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="savebar">
        <button
          type="button"
          class="btn btn--float"
          :disabled="saving"
          @click="save"
        >
          Salvar
        </button>
      </div>
    </template>
  </div>
</template>
