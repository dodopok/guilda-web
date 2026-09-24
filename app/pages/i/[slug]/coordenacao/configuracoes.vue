<script setup lang="ts">
import type { Church } from '~/types'

useHead({ title: 'Configurações' })
const { capi, link, info, tz, churchName, logoUrl, refreshInfo, slug } = useChurch()
const toast = useToast()
const route = useRoute()
const router = useRouter()

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

type SettingsSection = 'identity' | 'reminder' | 'liturgy'
const settingsSection = ref<SettingsSection | null>(null)
const settingsBaseline = ref<Record<string, unknown>>({})
const savingSection = ref(false)
const sectionFields: Record<SettingsSection, string[]> = {
  identity: ['name', 'defaultLocation', 'timezone', 'accentColor'],
  reminder: ['reminderEnabled', 'reminderWeekday', 'reminderTime', 'confirmationDeadlineHours'],
  liturgy: ['liturgicalReadingType', 'liturgicalPrayerBook'],
}
function isSettingsSection(value: unknown): value is SettingsSection {
  return value === 'identity' || value === 'reminder' || value === 'liturgy'
}
function valuesFor(section: SettingsSection) {
  return Object.fromEntries(sectionFields[section]!.map((key) => [key, form[key as keyof typeof form]]))
}
function openSection(section: SettingsSection, syncUrl = true) {
  settingsBaseline.value = valuesFor(section)
  settingsSection.value = section
  if (syncUrl && route.query.editar !== section) void router.replace({ query: { ...route.query, editar: section } })
}
function clearEditQuery() {
  if (!route.query.editar) return
  const query = { ...route.query }
  delete query.editar
  void router.replace({ query })
}
watch(() => route.query.editar, (value) => {
  if (isSettingsSection(value) && settingsSection.value !== value) openSection(value, false)
}, { immediate: true })
async function closeSection(section: SettingsSection, open: boolean) {
  if (open) {
    if (!settingsSection.value) openSection(section)
    return
  }
  if (settingsSection.value !== section || savingSection.value) return
  await saveSection(section, true)
}
async function saveSection(section: SettingsSection, closeWhileSaving: boolean) {
  const values = valuesFor(section)
  if (JSON.stringify(values) === JSON.stringify(settingsBaseline.value)) {
    settingsSection.value = null
    clearEditQuery()
    return
  }
  if (closeWhileSaving) {
    settingsSection.value = null
    clearEditQuery()
  }
  savingSection.value = true
  try {
    const r = await capi<{ church: Church }>('', {
      method: 'PATCH',
      body: {
        ...(section === 'identity'
          ? {
              name: form.name.trim(),
              defaultLocation: form.defaultLocation.trim() || null,
              timezone: form.timezone,
              accentColor: form.accentColor,
            }
          : {}),
        ...(section === 'reminder'
          ? {
              reminderEnabled: form.reminderEnabled,
              reminderWeekday: form.reminderWeekday,
              reminderTime: form.reminderTime,
              confirmationDeadlineHours: Math.max(0, Number(form.confirmationDeadlineHours) || 0),
            }
          : {}),
        ...(section === 'liturgy'
          ? {
              liturgicalReadingType: form.liturgicalReadingType,
              liturgicalPrayerBook: form.liturgicalPrayerBook,
            }
          : {}),
      },
    })
    savedAccent.value = r.church.accentColor
    await refreshInfo()
    toast.ok(section === 'identity' ? 'Identidade da igreja salva.' : 'Configuração salva.')
    settingsSection.value = null
    clearEditQuery()
  } catch (e) {
    toast.error(e)
    settingsSection.value = section
  } finally {
    savingSection.value = false
  }
}
const wa = computed(() => {
  const mode = info.value?.whatsappMode
  if (mode === 'cloud_api' || mode === 'ycloud') return { tag: 'canal oficial', tone: 'tag--ok', text: 'O canal oficial está configurado. Modelos sem aprovação e pessoas sem autorização ficam bloqueados individualmente.' }
  if (mode === 'simulation') return { tag: 'modo de teste', tone: 'tag--wait', text: 'Hoje nenhuma mensagem sai de verdade. Para ligar, precisamos do número oficial da igreja e de ao menos uma autorização registrada. Quem não autorizou não recebe.' }
  return { tag: 'desligado', tone: 'tag--no', text: 'Nenhuma mensagem sai. Ative o modo de teste para experimentar ou siga o passo a passo para ligar o canal oficial.' }
})
// Contagens dos atalhos: mensagens para revisar e músicas no repertório.
const { data: toolCounts } = useLazyAsyncData(`tool-counts-${slug.value}`, async () => {
  const [m, songs, channel] = await Promise.all([
    capi<{ counts: Record<string, number> }>('/messages?limit=1').catch(() => null),
    capi<{ songs: unknown[] }>('/songs').catch(() => null),
    capi<{ readiness: { hasCredentials: boolean, hasWebhookSecret: boolean, approvedTemplates: string[] }, templates: { status: string }[], coexistence: { status: string }, consents: { people: number, granted: number } }>('/whatsapp').catch(() => null),
  ])
  const waSteps = channel
    ? [
        channel.readiness.hasCredentials && channel.readiness.hasWebhookSecret,
        channel.coexistence.status === 'verified',
        channel.templates.some((template) => template.status === 'approved'),
        channel.consents.granted > 0,
      ].filter(Boolean).length
    : null
  return { review: (m?.counts.failed ?? 0) + (m?.counts.unknown ?? 0), songs: songs?.songs.length ?? null, waSteps }
})
const churchAddress = computed(() => import.meta.client ? `${window.location.origin}${link('')}` : link(''))
async function copyChurchAddress() {
  try {
    await navigator.clipboard.writeText(churchAddress.value)
    toast.ok('Endereço copiado.')
  } catch {
    toast.error('Não consegui copiar. Selecione e copie o endereço.')
  }
}
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
  <section class="stack-lg w-760 settings-page">
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
      <p class="lede">
        Cada item mostra como está agora. Abra para ajustar.
      </p>
    </div>

    <div class="row settings-address">
      <span class="ticon"><Icon
        name="external"
        :weight="2"
      /></span>
      <span class="grow"><strong>Endereço da igreja</strong><code>{{ churchAddress }}</code></span>
      <button
        type="button"
        class="btn btn--line btn--xs"
        @click="copyChurchAddress"
      >
        Copiar
      </button>
    </div>

    <button
      type="button"
      class="card settings-identity"
      @click="openSection('identity')"
    >
      <ChurchMark
        :name="form.name"
        :src="logoUrl"
        :size="56"
        :radius="16"
      />
      <span class="grow settings-identity__copy">
        <strong>{{ form.name }}</strong>
        <span>{{ [form.defaultLocation || 'Local não definido', TZ_LABEL[form.timezone] ?? form.timezone, 'cor da igreja'].join(' · ') }}</span>
        <small>Editar nome, endereço, fuso, logo e cor</small>
      </span>
      <Icon
        name="chevron-right"
        :weight="2"
      />
    </button>

    <div class="card card--flush settings-list">
      <NuxtLink
        :to="link('/coordenacao/whatsapp')"
        class="listrow"
      >
        <span class="ticon"><Icon
          name="send"
          :weight="2"
        /></span>
        <span class="grow"><strong class="settings-row__title">WhatsApp da igreja</strong><span class="settings-row__sub">{{ wa.tag }} · {{ toolCounts?.waSteps == null ? 'ver próximos passos' : `${toolCounts.waSteps} de 4 passos feitos` }}</span></span>
        <span
          class="tag"
          :class="wa.tone"
        >{{ wa.tag }}</span>
        <Icon
          name="chevron-right"
          class="listrow__chev"
        />
      </NuxtLink>
      <button
        type="button"
        class="listrow"
        @click="openSection('reminder')"
      >
        <span class="ticon"><Icon
          name="clock"
          :weight="2"
        /></span>
        <span class="grow"><strong class="settings-row__title">Lembrete semanal</strong><span class="settings-row__sub">{{ form.reminderEnabled ? `${DAYS[form.reminderWeekday]}, ${hhmm(form.reminderTime)}` : 'Desativado' }} · confirmar até {{ form.confirmationDeadlineHours }}h antes</span></span>
        <Icon
          name="chevron-right"
          class="listrow__chev"
        />
      </button>
      <button
        type="button"
        class="listrow"
        @click="openSection('liturgy')"
      >
        <span class="ticon"><Icon
          name="book"
          :weight="2"
        /></span>
        <span class="grow"><strong class="settings-row__title">Liturgia</strong><span class="settings-row__sub">{{ bookOptions.find((b) => b.code === form.liturgicalPrayerBook)?.name ?? form.liturgicalPrayerBook }} · {{ form.liturgicalReadingType === 'complementary' ? 'leituras complementares' : 'leituras semicontínuas' }}</span></span>
        <Icon
          name="chevron-right"
          class="listrow__chev"
        />
      </button>
      <NuxtLink
        :to="link('/coordenacao/modelos')"
        class="listrow"
      >
        <span class="ticon"><Icon
          name="book"
          :weight="2"
        /></span>
        <span class="grow"><strong class="settings-row__title">Modelos de liturgia</strong><span class="settings-row__sub">A ordem dos blocos de cada culto</span></span>
        <Icon
          name="chevron-right"
          class="listrow__chev"
        />
      </NuxtLink>
    </div>

    <div class="card card--flush">
      <p class="settings-section-title">
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
        />
      </div>
    </div>

    <Sheet
      :open="settingsSection === 'identity'"
      panel
      title="Identidade da igreja"
      lede="A prévia usa sua cor enquanto você ajusta. As mudanças ficam salvas ao fechar."
      @update:open="closeSection('identity', $event)"
    >
      <div class="stack-md settings-editor">
        <label class="field"><span class="field__label">Nome da igreja</span><input
          v-model="form.name"
          class="input"
        ></label>
        <div class="fields-2">
          <label class="field"><span class="field__label">Onde os cultos acontecem</span><input
            v-model="form.defaultLocation"
            class="input"
          ></label>
          <label class="field"><span class="field__label">Fuso horário</span><select
            v-model="form.timezone"
            class="select"
          ><option
            v-for="z in zones"
            :key="z"
            :value="z"
          >{{ TZ_LABEL[z] ?? z }} ({{ z }})</option></select></label>
        </div>
        <div class="row settings-logo-row">
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
              /><span style="display:block;font-weight:800;font-size:13px;margin-top:4px">{{ uploading ? 'Enviando…' : 'Enviar logo' }}</span><span style="display:block;font-size:11.5px;opacity:.85">quadrado, PNG ou JPG</span></span>
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
          <div class="stack-md settings-color-panel">
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
                <label class="swatch-custom"><input
                  v-model="form.accentColor"
                  type="color"
                  aria-label="Ajustar a cor"
                >Ajustar</label>
              </div>
              <p
                class="soft"
                style="margin-top:8px;font-size:13.5px"
              >
                {{ contrastMessage(form.accentColor) }}
              </p>
            </div>
            <div class="settings-preview">
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
                <ChurchMark
                  :name="form.name"
                  :src="logoUrl"
                  :size="34"
                  :radius="10"
                />
              </div>
            </div>
          </div>
        </div>
        <button
          class="btn btn--block"
          type="button"
          :disabled="savingSection"
          @click="saveSection('identity', false)"
        >
          {{ savingSection ? 'Salvando…' : 'Fechar e salvar' }}
        </button>
      </div>
    </Sheet>

    <Sheet
      :open="settingsSection === 'reminder'"
      panel
      title="Lembrete semanal"
      lede="Uma mensagem individual com as tarefas dos próximos 7 dias."
      @update:open="closeSection('reminder', $event)"
    >
      <div class="stack-md settings-editor">
        <SwitchRow
          v-model="form.reminderEnabled"
          title="Enviar lembrete semanal"
          sub="Só para quem autorizou receber mensagens."
          large
        />
        <template v-if="form.reminderEnabled">
          <div>
            <p class="field__label">
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
          <label class="field"><span class="field__label">Que hora?</span><input
            v-model="form.reminderTime"
            type="time"
            class="input"
            style="width:140px"
          ></label>
          <p
            v-if="nextReminder"
            class="settings-next-reminder"
          >
            Próximo envio: <strong>{{ nextReminder }}</strong>
          </p>
        </template>
        <label class="field"><span class="field__label">Pedir confirmação até</span><div class="row"><input
          v-model="form.confirmationDeadlineHours"
          type="number"
          min="0"
          max="336"
          class="input input--sm"
          style="width:100px;text-align:center"
        ><span class="soft">horas antes do culto</span></div></label>
        <button
          class="btn btn--block"
          type="button"
          :disabled="savingSection"
          @click="saveSection('reminder', false)"
        >
          {{ savingSection ? 'Salvando…' : 'Fechar e salvar' }}
        </button>
      </div>
    </Sheet>

    <Sheet
      :open="settingsSection === 'liturgy'"
      panel
      title="Liturgia"
      lede="Escolha o livro de oração e o tipo de leitura que a igreja usa."
      @update:open="closeSection('liturgy', $event)"
    >
      <div class="stack-md settings-editor">
        <label class="field"><span class="field__label">Livro de oração (Estêvão)</span><select
          v-model="form.liturgicalPrayerBook"
          class="select"
        ><option
          v-for="b in bookOptions"
          :key="b.code"
          :value="b.code"
        >{{ b.name }}</option></select><span
          v-if="books && !books.available"
          class="field__hint"
        >{{ books.reason }}</span></label>
        <label class="field"><span class="field__label">Leituras do lecionário (Estêvão)</span><select
          v-model="form.liturgicalReadingType"
          class="select"
        ><option value="complementary">Complementares</option><option value="semicontinuous">Semicontínuas</option></select></label>
        <button
          class="btn btn--block"
          type="button"
          :disabled="savingSection"
          @click="saveSection('liturgy', false)"
        >
          {{ savingSection ? 'Salvando…' : 'Fechar e salvar' }}
        </button>
      </div>
    </Sheet>
  </section>
</template>
