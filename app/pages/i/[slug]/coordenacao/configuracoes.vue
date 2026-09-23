<script setup lang="ts">
import type { Church } from '~/types'

useHead({ title: 'Configurações' })
const { capi, link, info, tz, churchName, logoUrl, refreshInfo, slug } = useChurch()
const toast = useToast()

const c = computed(() => info.value!.church)
const form = reactive({
  name: c.value.name,
  defaultLocation: c.value.defaultLocation ?? '',
  timezone: c.value.timezone,
  reminderEnabled: c.value.reminderEnabled,
  reminderWeekday: c.value.reminderWeekday,
  reminderTime: c.value.reminderTime,
  confirmationDeadlineHours: c.value.confirmationDeadlineHours,
  liturgicalReadingType: c.value.liturgicalReadingType,
  liturgicalPrayerBook: c.value.liturgicalPrayerBook,
  accentColor: c.value.accentColor,
})
const savedAccent = ref(c.value.accentColor)
// A cor muda o app inteiro na hora, para a coordenação ver como fica.
watch(() => form.accentColor, (v) => {
  if (info.value) info.value.church.accentColor = v
})
onBeforeRouteLeave(() => {
  if (info.value && form.accentColor !== savedAccent.value) info.value.church.accentColor = savedAccent.value
})
// Livros de oração vêm do Estêvão (a API exige escolher um).
const { data: books } = useLazyAsyncData(`prayer-books-${slug.value}`, () => capi<{ available: boolean, reason?: string, books: { code: string, name: string }[] }>('/liturgy/prayer-books').catch(() => null))
const bookOptions = computed(() => {
  const list = books.value?.books ?? []
  return list.some((b) => b.code === form.liturgicalPrayerBook) ? list : [{ code: form.liturgicalPrayerBook, name: form.liturgicalPrayerBook }, ...list]
})
const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Belem', 'America/Cuiaba', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon']
const TZ_LABEL: Record<string, string> = { 'America/Sao_Paulo': 'Brasília', 'America/Manaus': 'Manaus', 'America/Fortaleza': 'Fortaleza', 'America/Belem': 'Belém', 'America/Cuiaba': 'Cuiabá', 'America/Rio_Branco': 'Rio Branco', 'America/Noronha': 'Fernando de Noronha', 'Europe/Lisbon': 'Lisboa' }
const zones = computed(() => (TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]))

// ------------------------------------------------------------ logo e cor
const palette = ref<string[]>([])
const swatches = computed(() => (palette.value.length ? palette.value : SWATCHES))
const uploading = ref(false)
function resize(img: HTMLImageElement) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const s = Math.min(img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size)
  const webp = canvas.toDataURL('image/webp', 0.9)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
}
async function onLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const img = await loadImageFile(file)
    const dataUrl = resize(img)
    await capi('/logo', { method: 'PUT', body: { dataUrl } })
    const found = extractPalette(img)
    if (found.length) {
      palette.value = found
      form.accentColor = found[0]!
      toast.ok('Cores encontradas no logo. Ajuste se quiser e salve.')
    } else {
      toast.ok('Logo enviado.')
    }
    await refreshInfo()
    if (info.value) info.value.church.accentColor = form.accentColor
  } catch (err) {
    toast.error(err, 'Não foi possível enviar a imagem.')
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
async function removeLogo() {
  try {
    await capi('/logo', { method: 'DELETE' })
    palette.value = []
    await refreshInfo()
    if (info.value) info.value.church.accentColor = form.accentColor
    toast.ok('Logo retirado.')
  } catch (e) {
    toast.error(e)
  }
}

// ------------------------------------------------------------ lembrete
const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const nextReminder = computed(() => {
  const now = new Date()
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getTime() + i * 86400_000)
    const key = localDateKey(d, tz.value)
    if (new Date(`${key}T12:00:00Z`).getUTCDay() !== form.reminderWeekday) continue
    const at = zonedToIso(key, form.reminderTime, tz.value)
    if (Date.parse(at) > now.getTime()) return `${longDate(at, tz.value)}, ${hhmm(form.reminderTime)}`
  }
  return ''
})

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const r = await capi<{ church: Church }>('', {
      method: 'PATCH',
      body: {
        name: form.name.trim(),
        defaultLocation: form.defaultLocation.trim() || null,
        timezone: form.timezone,
        reminderEnabled: form.reminderEnabled,
        reminderWeekday: form.reminderWeekday,
        reminderTime: form.reminderTime,
        confirmationDeadlineHours: Math.max(0, Number(form.confirmationDeadlineHours) || 0),
        liturgicalReadingType: form.liturgicalReadingType,
        liturgicalPrayerBook: form.liturgicalPrayerBook,
        accentColor: form.accentColor,
      },
    })
    savedAccent.value = r.church.accentColor
    await refreshInfo()
    toast.ok('Configurações salvas. A cara da igreja já mudou em todo o app.')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
const wa = computed(() => {
  const mode = info.value?.whatsappMode
  if (mode === 'cloud_api' || mode === 'ycloud') return { tag: 'canal oficial', tone: 'tag--ok', text: 'O canal oficial está configurado. Os envios reais seguem as travas do canal (modelos aprovados, modo de teste e autorização de cada pessoa).' }
  if (mode === 'simulation') return { tag: 'modo de teste', tone: 'tag--wait', text: 'Hoje nenhuma mensagem sai de verdade. Para ligar, precisamos do número oficial da igreja e da autorização de cada pessoa — a gente te guia passo a passo.' }
  return { tag: 'desligado', tone: 'tag--no', text: 'Nenhuma mensagem sai. Ative o modo de teste para experimentar ou siga o passo a passo para ligar o canal oficial.' }
})
// Contagens dos atalhos: mensagens para revisar e músicas no repertório.
const { data: toolCounts } = useLazyAsyncData(`tool-counts-${slug.value}`, async () => {
  const [m, songs] = await Promise.all([
    capi<{ counts: Record<string, number> }>('/messages?limit=1').catch(() => null),
    capi<{ songs: unknown[] }>('/songs').catch(() => null),
  ])
  return { review: (m?.counts.failed ?? 0) + (m?.counts.unknown ?? 0), songs: songs?.songs.length ?? null }
})
const tools = computed(() => [
  { to: '/coordenacao/mensagens', label: 'Mensagens enviadas', sub: 'Tudo que saiu pelo WhatsApp', icon: 'message', badge: toolCounts.value?.review ? `${toolCounts.value.review} para revisar` : '' },
  { to: '/coordenacao/whatsapp', label: 'Canal do WhatsApp', sub: 'Modo, número e modelos de mensagem', icon: 'send', badge: info.value?.whatsappMode === 'simulation' ? 'simulação' : '' },
  { to: '/coordenacao/modelos', label: 'Modelos de liturgia', sub: 'A ordem do culto', icon: 'book', badge: '' },
  { to: '/coordenacao/repertorio', label: 'Repertório', sub: toolCounts.value?.songs != null ? plural(toolCounts.value.songs, 'música', 'músicas') : 'Músicas da igreja', icon: 'music', badge: '' },
  { to: '/coordenacao/importar', label: 'Importar planilha', sub: 'Traga a escala antiga', icon: 'upload', badge: '' },
  { to: '/coordenacao/historico', label: 'Histórico', sub: 'Quem mudou o quê', icon: 'clock', badge: '' },
])
</script>

<template>
  <section class="stack-md w-760">
    <div>
      <BackLink
        :to="link('/coordenacao')"
        label="Mesa"
      />
      <h1
        class="h1--sm"
        style="margin-top:6px"
      >
        Configurações
      </h1>
    </div>

    <div class="card card--lg">
      <h2 class="h3">
        A cara da sua igreja
      </h2>
      <p
        class="soft"
        style="margin-top:4px;font-size:15px"
      >
        Envie o logo; a gente acha a cor.
      </p>
      <div
        class="row"
        style="gap:20px;margin-top:18px;align-items:flex-start"
      >
        <div
          class="stack-sm"
          style="align-items:flex-start"
        >
          <label
            class="logodrop"
            :class="{ 'logodrop--has': logoUrl }"
          >
            <img
              v-if="logoUrl"
              :src="logoUrl"
              :alt="`Logo de ${churchName}`"
            >
            <span
              v-else
              style="text-align:center;padding:12px"
            ><Icon
              name="upload"
              :weight="2"
              style="width:26px;height:26px"
            /><span
              style="display:block;font-weight:800;font-size:13px;margin-top:4px"
            >{{ uploading ? 'Enviando…' : 'Enviar logo' }}</span><span
              style="display:block;font-size:11.5px;opacity:.85"
            >quadrado, PNG ou JPG</span></span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Enviar logo da igreja"
              :disabled="uploading"
              @change="onLogo"
            >
          </label>
          <button
            v-if="logoUrl"
            type="button"
            class="link link--muted"
            @click="removeLogo"
          >
            Tirar logo
          </button>
        </div>
        <div
          class="stack-md"
          style="flex:1;min-width:240px"
        >
          <div>
            <p
              class="strong"
              style="font-size:14.5px;margin-bottom:8px"
            >
              Cor da igreja
            </p>
            <div
              class="row"
              role="radiogroup"
              aria-label="Cor da igreja"
            >
              <button
                v-for="w in swatches"
                :key="w"
                type="button"
                role="radio"
                class="swatch"
                :aria-checked="w.toLowerCase() === form.accentColor.toLowerCase()"
                :aria-label="`Cor ${w}`"
                :style="{ background: w }"
                @click="form.accentColor = w.toLowerCase()"
              />
              <label class="swatch-custom">
                <input
                  v-model="form.accentColor"
                  type="color"
                  aria-label="Ajustar a cor"
                >Ajustar
              </label>
            </div>
            <p
              class="soft"
              style="margin-top:8px;font-size:13.5px"
            >
              {{ contrastMessage(form.accentColor) }}
            </p>
          </div>
          <div style="background:var(--surface-3);border-radius:18px;padding:14px">
            <p
              class="caps"
              style="margin-bottom:10px"
            >
              Como fica
            </p>
            <div
              class="row"
              style="gap:12px"
            >
              <span
                class="btn btn--sm"
                style="min-height:42px;pointer-events:none"
              >Confirmar</span>
              <span
                class="tag tag--lg"
                style="background:var(--accent-soft);color:var(--accent-deep)"
              >Sua próxima escala</span>
              <span
                class="row"
                style="flex-wrap:nowrap;gap:8px;background:#fff;border-radius:10px;padding:6px 10px 6px 6px;border:1px solid var(--control)"
              >
                <ChurchMark
                  :name="form.name"
                  :src="logoUrl"
                  :size="18"
                  :radius="4"
                />
                <span style="font-size:12.5px;font-weight:700;color:var(--ink-2)">{{ form.name }} · Guilda</span>
              </span>
              <span style="display:inline-flex;flex-direction:column;align-items:center;gap:4px">
                <ChurchMark
                  :name="form.name"
                  :src="logoUrl"
                  :size="48"
                  :radius="12"
                  style="box-shadow:0 4px 10px -4px rgba(0,0,0,.3)"
                />
                <span style="font-size:10px;font-weight:700;color:var(--ink-3)">ícone no celular</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card card--lg stack-md">
      <h2 class="h3">
        Igreja
      </h2>
      <label class="field"><span class="field__label">Nome</span><input
        v-model="form.name"
        class="input"
      ></label>
      <div class="grid-auto">
        <label class="field"><span class="field__label">Onde os cultos acontecem</span><input
          v-model="form.defaultLocation"
          class="input"
        ></label>
        <label class="field"><span class="field__label">Fuso horário</span><select
          v-model="form.timezone"
          class="select"
        >
          <option
            v-for="z in zones"
            :key="z"
            :value="z"
          >{{ TZ_LABEL[z] ?? z }} ({{ z }})</option>
        </select></label>
      </div>
      <label class="field"><span class="field__label">Livro de oração (Estêvão)</span><select
        v-model="form.liturgicalPrayerBook"
        class="select"
      >
        <option
          v-for="b in bookOptions"
          :key="b.code"
          :value="b.code"
        >{{ b.name }}</option>
      </select><span
        v-if="books && !books.available"
        class="field__hint"
      >{{ books.reason }}</span></label>
      <label class="field"><span class="field__label">Leituras do lecionário (Estêvão)</span><select
        v-model="form.liturgicalReadingType"
        class="select"
      >
        <option value="complementary">Complementares</option>
        <option value="semicontinuous">Semicontínuas</option>
      </select></label>
    </div>

    <div class="card card--lg stack-md">
      <SwitchRow
        v-model="form.reminderEnabled"
        title="Lembrete semanal"
        sub="Uma mensagem por pessoa com as tarefas dos próximos 7 dias."
        large
        style="padding:0"
      >
        <template #title>
          <span
            class="h3"
            style="display:block"
          >Lembrete semanal</span>
        </template>
      </SwitchRow>
      <template v-if="form.reminderEnabled">
        <div>
          <p
            class="field__label"
          >
            Que dia?
          </p>
          <div
            class="chips"
            role="radiogroup"
            aria-label="Dia do lembrete"
          >
            <button
              v-for="(d, i) in DAYS"
              :key="d"
              type="button"
              role="radio"
              class="daychip"
              :aria-checked="form.reminderWeekday === i"
              @click="form.reminderWeekday = i"
            >
              {{ d }}
            </button>
          </div>
        </div>
        <div
          class="row"
          style="gap:14px;align-items:flex-end"
        >
          <label class="field"><span class="field__label">Que hora?</span><input
            v-model="form.reminderTime"
            type="time"
            class="input"
            style="width:130px"
          ></label>
          <p
            v-if="nextReminder"
            style="margin-bottom:4px;font-size:14.5px;color:var(--ink-2);background:var(--accent-soft);border-radius:12px;padding:10px 14px"
          >
            Próximo envio: <strong>{{ nextReminder }}</strong>
          </p>
        </div>
      </template>
    </div>

    <div class="card card--lg stack-sm">
      <h2 class="h3">
        Confirmações
      </h2>
      <div class="row">
        <p style="color:var(--ink-2)">
          Pedir resposta até
        </p>
        <input
          v-model="form.confirmationDeadlineHours"
          type="number"
          min="0"
          max="336"
          class="input input--sm"
          style="width:90px;text-align:center"
          aria-label="Horas antes do culto"
        >
        <p style="color:var(--ink-2)">
          horas antes do culto.
        </p>
      </div>
    </div>

    <div class="card card--lg stack-sm">
      <div class="row">
        <h2 class="h3 grow">
          WhatsApp da igreja
        </h2>
        <span
          class="tag tag--lg"
          :class="wa.tone"
        >{{ wa.tag }}</span>
      </div>
      <p
        class="soft"
        style="font-size:15px"
      >
        {{ wa.text }}
      </p>
      <NuxtLink
        :to="link('/coordenacao/whatsapp')"
        class="btn btn--secondary btn--md"
        style="align-self:flex-start;min-height:44px"
      >
        Ver o passo a passo para ligar
      </NuxtLink>
    </div>

    <div class="card card--flush">
      <p style="padding:16px 18px 8px;font-size:20px;font-weight:800">
        Mais ferramentas
      </p>
      <div class="rows">
        <ToolLink
          v-for="m in tools"
          :key="m.to"
          :to="link(m.to)"
          :icon="m.icon"
          :label="m.label"
          :sub="m.sub"
          :badge="m.badge"
          style="border-top:1px solid var(--line-2)"
        />
      </div>
    </div>

    <div class="savebar">
      <button
        type="button"
        class="btn btn--float"
        style="padding:12px 24px"
        :disabled="saving"
        @click="save"
      >
        Salvar
      </button>
    </div>
  </section>
</template>
