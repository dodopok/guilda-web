<script setup lang="ts">
import type { PersonAdmin } from '~/types'

// Configuração inicial da igreja: nome, logo e cor; funções; pessoas; lembretes.
useHead({ title: 'Configuração inicial' })
const { capi, link, info, churchName, logoUrl, refreshInfo, prepMonth } = useChurch()
const { me } = useSession()
const toast = useToast()
const step = ref(1)
const setupLayout = ref<HTMLElement | null>(null)
const setupReady = ref(false)
const firstName = computed(() => (me.value?.account.displayName ?? '').split(' ')[0] ?? '')

watch(step, async () => {
  if (!setupReady.value) return
  await nextTick()
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches) {
    setupLayout.value?.scrollIntoView({ block: 'start' })
  }
})

// Passo 1: identidade
const form = reactive({ name: info.value?.church.name ?? '', defaultLocation: info.value?.church.defaultLocation ?? '', accentColor: info.value?.church.accentColor ?? DEFAULT_ACCENT })
const identitySaved = ref(false)
watch(() => [form.name, form.defaultLocation, form.accentColor], () => {
  if (identitySaved.value) identitySaved.value = false
})
useHead(() => ({ htmlAttrs: { style: accentStyle(form.accentColor) } }))
const palette = ref<string[]>([])
const swatches = computed(() => (palette.value.length ? palette.value : SWATCHES))
async function onLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const img = await loadImageFile(file)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256)
    const webp = canvas.toDataURL('image/webp', 0.9)
    await capi('/logo', { method: 'PUT', body: { dataUrl: webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png') } })
    const found = extractPalette(img)
    if (found.length) {
      palette.value = found
      form.accentColor = found[0]!
      toast.ok('Cores encontradas no logo. Ajuste se quiser.')
    }
    await refreshInfo()
  } catch (err) {
    toast.error(err, 'Não foi possível enviar a imagem.')
  }
}
async function saveIdentity() {
  try {
    await capi('', { method: 'PATCH', body: { name: form.name.trim(), defaultLocation: form.defaultLocation.trim() || null, accentColor: form.accentColor.toLowerCase() } })
    await refreshInfo()
    identitySaved.value = true
    step.value = 2
  } catch (e) {
    toast.error(e)
  }
}

// Passo 2: funções
interface CatalogItem { key: string, ministry: string, name: string, exists: boolean, suggested: boolean }
const catalog = ref<CatalogItem[]>([])
const chosen = ref<Set<string>>(new Set())
const functionsSaved = ref(false)
onMounted(async () => {
  try {
    const r = await capi<{ catalog: CatalogItem[], hasDuties: boolean }>('/setup')
    catalog.value = r.catalog
    chosen.value = new Set(r.catalog.filter((c) => c.exists || (!r.hasDuties && c.suggested)).map((c) => c.key))
    functionsSaved.value = r.hasDuties
    identitySaved.value = Boolean(info.value?.church.name)
    step.value = !identitySaved.value ? 1 : !r.hasDuties ? 2 : 3
    await loadPeople()
    setupReady.value = true
  } catch (e) {
    toast.error(e)
  }
})
const groups = computed(() => {
  const map = new Map<string, CatalogItem[]>()
  for (const c of catalog.value) map.set(c.ministry, [...(map.get(c.ministry) ?? []), c])
  return [...map.entries()].map(([m, items]) => ({ m, items }))
})
function toggleFunc(c: CatalogItem) {
  if (c.exists) return
  const s = new Set(chosen.value)
  if (s.has(c.key)) s.delete(c.key)
  else s.add(c.key)
  chosen.value = s
  functionsSaved.value = false
}
async function saveFuncs() {
  try {
    await capi('/setup/duties', { method: 'POST', body: { keys: [...chosen.value] } })
    functionsSaved.value = true
    step.value = 3
  } catch (e) {
    toast.error(e)
  }
}

// Passo 3: pessoas
const people = ref<PersonAdmin[]>([])
const peopleDone = ref(false)
async function loadPeople() {
  people.value = (await capi<{ people: PersonAdmin[] }>('/people')).people.filter((p) => p.status === 'active')
}
const bulkText = ref('')
const bulkBusy = ref(false)
watch(bulkText, (value) => {
  if (value && peopleDone.value) peopleDone.value = false
})
const parsedPeople = computed(() => bulkText.value.split(/\r?\n/).map((line) => {
  const [name = '', ...rest] = line.trim().split(/[\t,;|]/)
  const phone = rest.join(' ').trim()
  return { name: name.trim(), phone: phone || null }
}).filter((p) => p.name.length >= 2))
const peopleWithPhone = computed(() => parsedPeople.value.filter((p) => {
  const digits = p.phone?.replace(/\D/g, '').length ?? 0
  return digits >= 10 && digits <= 15
}).length)
const invalidPhoneCount = computed(() => parsedPeople.value.filter((p) => {
  if (!p.phone) return false
  const digits = p.phone.replace(/\D/g, '')
  return digits.length < 10 || digits.length > 15
}).length)
async function addBulkPeople() {
  if (!parsedPeople.value.length || bulkBusy.value) return
  const peopleToCreate = [...parsedPeople.value]
  let created = 0
  bulkBusy.value = true
  try {
    for (const person of peopleToCreate) {
      await capi('/people', { method: 'POST', body: { displayName: person.name, phone: person.phone, roles: ['participant'] } })
      created++
    }
    bulkText.value = ''
    await loadPeople().catch(() => undefined)
    toast.ok(`${created} ${created === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}.`)
    peopleDone.value = true
    step.value = 4
  } catch (e) {
    if (created) bulkText.value = peopleToCreate.slice(created).map((person) => `${person.name}${person.phone ? `, ${person.phone}` : ''}`).join('\n')
    await loadPeople().catch(() => undefined)
    toast.error(e, created ? `${created} pessoas cadastradas; revise as restantes antes de tentar novamente.` : 'Não foi possível cadastrar as pessoas.')
  } finally {
    bulkBusy.value = false
  }
}

// Passo 4: lembretes
const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const reminder = reactive({ weekday: info.value?.church.reminderWeekday ?? 4, time: info.value?.church.reminderTime ?? '19:00' })
const reminderSaved = ref(Boolean(info.value?.church.reminderEnabled))
watch(() => [reminder.weekday, reminder.time], () => {
  if (reminderSaved.value) reminderSaved.value = false
})
async function saveReminder() {
  try {
    await capi('', { method: 'PATCH', body: { reminderEnabled: true, reminderWeekday: reminder.weekday, reminderTime: reminder.time } })
    // Enquanto o canal oficial não está pronto, tudo roda em simulação (nada sai de verdade).
    if (!info.value?.whatsappMode || info.value.whatsappMode === 'disabled') await capi('/whatsapp', { method: 'PATCH', body: { mode: 'simulation' } })
    await refreshInfo()
    reminderSaved.value = true
    step.value = 5
  } catch (e) {
    toast.error(e)
  }
}

// Passo 5: primeira escala
const dutyCount = computed(() => chosen.value.size)
const ministryCount = computed(() => new Set(catalog.value.filter((c) => chosen.value.has(c.key)).map((c) => c.ministry)).size)
function stepDone(n: number) {
  return n === 1
    ? identitySaved.value
    : n === 2
      ? functionsSaved.value
      : n === 3
        ? peopleDone.value
        : n === 4
          ? reminderSaved.value
          : false
}
function skipPeople() {
  peopleDone.value = true
  step.value = 4
}
const nextStep = computed(() => !identitySaved.value ? 1 : !functionsSaved.value ? 2 : !peopleDone.value ? 3 : !reminderSaved.value ? 4 : 5)
function openStep(n: number) {
  if (n <= nextStep.value) step.value = n
}
const setupSteps = computed(() => [
  { n: 1, title: 'Sua igreja', summary: identitySaved.value ? `${form.name || churchName.value} · ${form.defaultLocation || 'local a definir'} · feito` : 'Nome, local e cor' },
  { n: 2, title: 'Funções', summary: functionsSaved.value ? `${dutyCount.value} funções em ${ministryCount.value} ministérios · feito` : 'Escolha o que existe nos cultos' },
  { n: 3, title: 'Pessoas', summary: peopleDone.value ? `${people.value.length} ${people.value.length === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'} · feito` : `Cadastre quem serve · ${people.value.length} ${people.value.length === 1 ? 'pessoa' : 'pessoas'} · agora` },
  { n: 4, title: 'WhatsApp', summary: reminderSaved.value ? 'Lembretes configurados · feito' : 'Ligar depois — pode usar em modo de teste' },
  { n: 5, title: 'Primeiro mês', summary: 'Cultos e primeira escala' },
])
async function finish(to: 'preparar' | 'mesa') {
  try {
    await capi('/setup/complete', { method: 'POST' })
    await refreshInfo()
    await navigateTo(to === 'preparar' ? link(`/coordenacao/preparar/${prepMonth.value}?passo=1`) : link('/coordenacao'))
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <section
    ref="setupLayout"
    class="setup-layout"
  >
    <header class="setup-heading">
      <p class="setup-heading__eyebrow">
        Bem-vinda, {{ firstName }} <span aria-hidden="true">·</span> 5 passos, uns 10 minutos
      </p>
      <h1 class="h1">
        Vamos deixar a igreja pronta
      </h1>
    </header>
    <div class="setup-layout__grid">
      <nav
        class="setup-checklist"
        aria-label="Etapas da configuração"
      >
        <button
          v-for="item in setupSteps"
          :key="item.n"
          type="button"
          class="setup-checklist__item"
          :class="{ 'setup-checklist__item--active': step === item.n, 'setup-checklist__item--done': stepDone(item.n) }"
          :aria-current="step === item.n ? 'step' : undefined"
          :disabled="item.n > nextStep"
          @click="openStep(item.n)"
        >
          <span class="setup-checklist__number">
            <Icon
              v-if="stepDone(item.n)"
              name="check"
              :weight="2.4"
            />
            <template v-else>{{ item.n }}</template>
          </span>
          <span class="setup-checklist__copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.summary }}</small>
          </span>
          <Icon
            name="chevron-right"
            class="setup-checklist__arrow"
          />
        </button>
      </nav>

      <section
        class="setup-current stack-lg"
      >
        <div class="setup-current__top">
          <button
            v-if="step > 1"
            type="button"
            class="icon-btn icon-btn--round"
            aria-label="Voltar uma etapa"
            @click="step--"
          >
            <Icon
              name="arrow-left"
              :weight="2"
            />
          </button>
          <p class="strong muted">
            Passo {{ step }} de 5
          </p>
          <span
            class="dots"
            aria-hidden="true"
          ><span
            v-for="n in 5"
            :key="n"
            :class="{ on: n <= step }"
          /></span>
        </div>

        <template v-if="step === 1">
          <div>
            <h1
              class="h1"
              style="font-size:26px"
            >
              Sua igreja
            </h1>
            <p
              class="soft"
              style="margin-top:8px"
            >
              Conte como a igreja aparece para as pessoas. Você pode ajustar isso depois.
            </p>
          </div>
          <label class="field"><span class="field__label">Nome da igreja</span><input
            v-model="form.name"
            class="input input--lg"
          ></label>
          <label class="field"><span class="field__label">Local</span><input
            v-model="form.defaultLocation"
            class="input input--lg"
            placeholder="Ex.: salão principal"
            autocomplete="organization"
          ></label>
          <div
            class="row"
            style="gap:18px;align-items:flex-start"
          >
            <label
              class="logodrop"
              :class="{ 'logodrop--has': logoUrl }"
              style="width:120px;height:120px;border-radius:30px"
            >
              <img
                v-if="logoUrl"
                :src="logoUrl"
                :alt="`Logo de ${churchName}`"
              >
              <span
                v-else
                style="text-align:center;padding:10px"
              ><Icon
                name="upload"
                :weight="2"
                style="width:24px;height:24px"
              /><span style="display:block;font-weight:800;font-size:12.5px;margin-top:4px">Enviar logo</span></span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Enviar logo da igreja"
                @change="onLogo"
              >
            </label>
            <div style="flex:1;min-width:220px">
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
                  style="width:36px;height:36px"
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
              <div
                class="row"
                style="margin-top:12px"
              >
                <span
                  class="btn btn--sm"
                  style="pointer-events:none"
                >Confirmar</span>
                <span
                  class="tag tag--lg"
                  style="background:var(--accent-soft);color:var(--accent-deep)"
                >Sua próxima escala</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="btn"
            style="align-self:flex-start"
            :disabled="form.name.trim().length < 2"
            @click="saveIdentity"
          >
            Salvar e seguir
          </button>
        </template>

        <template v-else-if="step === 2">
          <div>
            <h1
              class="h1"
              style="font-size:26px"
            >
              Quais funções existem nos seus cultos?
            </h1>
            <p
              class="soft"
              style="margin-top:8px"
            >
              Marcamos as mais comuns. Toque para tirar ou acrescentar — dá para mudar depois. <strong style="color:var(--ink)">{{ dutyCount }} {{ dutyCount === 1 ? 'escolhida' : 'escolhidas' }}.</strong>
            </p>
          </div>
          <div
            class="stack-md"
            style="max-height:46vh;overflow:auto;padding-right:4px"
          >
            <div
              v-for="g in groups"
              :key="g.m"
            >
              <p
                class="caps"
                style="margin-bottom:6px"
              >
                {{ g.m }}
              </p>
              <div class="chips">
                <button
                  v-for="c in g.items"
                  :key="c.key"
                  type="button"
                  class="chip chip--lg"
                  :aria-pressed="chosen.has(c.key)"
                  :aria-disabled="c.exists"
                  :title="c.exists ? 'Já cadastrada' : undefined"
                  @click="toggleFunc(c)"
                >
                  <Icon
                    v-if="chosen.has(c.key)"
                    name="check"
                    :weight="2.4"
                  />{{ c.name }}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="btn"
            style="align-self:flex-start"
            @click="saveFuncs"
          >
            Salvar funções e seguir
          </button>
        </template>

        <template v-else-if="step === 3">
          <div>
            <h1
              class="h1"
              style="font-size:26px"
            >
              Cadastre quem serve
            </h1>
            <p
              class="soft"
              style="margin-top:8px"
            >
              Cole os nomes, um por linha. Se quiser, coloque o celular depois do nome, separado por vírgula ou tabulação.
            </p>
          </div>
          <label class="field">
            <span class="field__label">Nomes e celulares</span>
            <textarea
              v-model="bulkText"
              class="input setup-people-input"
              rows="7"
              placeholder="Ana Souza, 11999990000&#10;Bruno Lima&#10;Carla Nunes, 11988887777"
              aria-describedby="setup-people-preview"
            />
          </label>
          <p
            id="setup-people-preview"
            class="small muted"
          >
            {{ parsedPeople.length }} {{ parsedPeople.length === 1 ? 'pessoa reconhecida' : 'pessoas reconhecidas' }}<template v-if="peopleWithPhone">
              · {{ peopleWithPhone }} com celular
            </template>
          </p>
          <p
            v-if="invalidPhoneCount"
            class="form-error"
            role="alert"
          >
            Confira o DDD e o número de {{ invalidPhoneCount === 1 ? 'celular' : 'celulares' }} informado{{ invalidPhoneCount === 1 ? '' : 's' }}.
          </p>
          <div
            v-if="people.length"
            class="setup-existing-people"
          >
            <p class="caps">
              Já cadastradas · {{ people.length }}
            </p>
            <div class="chips">
              <span
                v-for="person in people"
                :key="person.id"
                class="chip chip--static"
              >{{ person.displayName }}</span>
            </div>
          </div>
          <div class="setup-people-actions">
            <button
              type="button"
              class="btn"
              :disabled="bulkBusy || !parsedPeople.length || invalidPhoneCount > 0"
              @click="addBulkPeople"
            >
              {{ bulkBusy ? 'Cadastrando…' : `Cadastrar ${parsedPeople.length} ${parsedPeople.length === 1 ? 'pessoa' : 'pessoas'} e seguir` }}
            </button>
            <button
              type="button"
              class="link link--muted"
              @click="skipPeople"
            >
              Pular por agora
            </button>
            <NuxtLink
              :to="link('/coordenacao/importar')"
              class="link"
            >
              <Icon
                name="upload"
                :weight="1.9"
              /> Importar
            </NuxtLink>
          </div>
        </template>

        <template v-else-if="step === 4">
          <div>
            <h1
              class="h1"
              style="font-size:26px"
            >
              WhatsApp
            </h1>
            <p
              class="soft"
              style="margin-top:8px"
            >
              Você pode ligar os lembretes depois. Enquanto isso, a igreja já pode usar a Guilda em modo de teste.
            </p>
          </div>
          <p
            v-if="info?.whatsappMode !== 'cloud_api' && info?.whatsappMode !== 'ycloud'"
            class="panel panel--wait"
            style="border-radius:18px;padding:14px 16px;font-size:15px"
          >
            <strong>Ligar depois — pode usar em modo de teste.</strong> Nenhuma mensagem sai de verdade enquanto o canal oficial não estiver conectado.
          </p>
          <div>
            <p class="field__label">
              Em que dia enviar os lembretes?
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
                :aria-checked="reminder.weekday === i"
                @click="reminder.weekday = i"
              >
                {{ d }}
              </button>
            </div>
          </div>
          <label class="field"><span class="field__label">Que hora?</span><input
            v-model="reminder.time"
            type="time"
            class="input"
            style="width:130px"
          ></label>
          <button
            type="button"
            class="btn"
            style="align-self:flex-start"
            @click="saveReminder"
          >
            Salvar e seguir
          </button>
        </template>

        <template v-else>
          <div style="padding:8px 0">
            <span
              class="mark mark--done"
              style="width:60px;height:60px"
            ><Icon
              name="check"
              :weight="2.6"
              style="width:34px;height:34px"
            /></span>
            <h1
              class="h1"
              style="margin-top:16px;font-size:28px"
            >
              Primeiro mês
            </h1>
            <p
              class="soft"
              style="margin:8px auto 0;max-width:420px"
            >
              Os cultos e a primeira escala de {{ monthName(prepMonth) }} ficam prontos por aqui. Você também pode ir para a mesa da igreja.
            </p>
          </div>
          <div
            class="row"
            style="flex-wrap:wrap"
          >
            <button
              type="button"
              class="btn"
              @click="finish('preparar')"
            >
              Preparar {{ monthName(prepMonth) }}<Icon
                name="arrow-right"
                :weight="2.2"
              />
            </button>
            <button
              type="button"
              class="btn btn--secondary"
              style="font-size:15px"
              @click="finish('mesa')"
            >
              Ir para o início
            </button>
          </div>
        </template>
      </section>
    </div>
  </section>
</template>
