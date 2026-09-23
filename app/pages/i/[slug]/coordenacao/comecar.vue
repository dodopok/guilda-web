<script setup lang="ts">
import type { PersonAdmin } from '~/types'

// Configuração inicial da igreja: nome, logo e cor; funções; pessoas; lembretes.
useHead({ title: 'Configuração inicial' })
const { capi, link, info, churchName, logoUrl, refreshInfo, prepMonth } = useChurch()
const { me } = useSession()
const toast = useToast()
const step = ref(1)
const firstName = computed(() => (me.value?.account.displayName ?? '').split(' ')[0] ?? '')

// Passo 2: identidade
const form = reactive({ name: info.value?.church.name ?? '', accentColor: info.value?.church.accentColor ?? DEFAULT_ACCENT })
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
    await capi('', { method: 'PATCH', body: { name: form.name.trim(), accentColor: form.accentColor.toLowerCase() } })
    await refreshInfo()
    step.value = 3
  } catch (e) {
    toast.error(e)
  }
}

// Passo 3: funções
interface CatalogItem { key: string, ministry: string, name: string, exists: boolean, suggested: boolean }
const catalog = ref<CatalogItem[]>([])
const chosen = ref<Set<string>>(new Set())
onMounted(async () => {
  const r = await capi<{ catalog: CatalogItem[], hasDuties: boolean }>('/setup')
  catalog.value = r.catalog
  chosen.value = new Set(r.catalog.filter((c) => c.exists || (!r.hasDuties && c.suggested)).map((c) => c.key))
  await loadPeople()
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
}
async function saveFuncs() {
  try {
    await capi('/setup/duties', { method: 'POST', body: { keys: [...chosen.value] } })
    step.value = 4
  } catch (e) {
    toast.error(e)
  }
}

// Passo 4: pessoas
const people = ref<PersonAdmin[]>([])
async function loadPeople() {
  people.value = (await capi<{ people: PersonAdmin[] }>('/people')).people.filter((p) => p.status === 'active')
}
const np = reactive({ name: '', phone: '' })
async function addPerson() {
  if (np.name.trim().length < 2) return
  try {
    await capi('/people', { method: 'POST', body: { displayName: np.name.trim(), phone: np.phone.trim() || null } })
    Object.assign(np, { name: '', phone: '' })
    await loadPeople()
  } catch (e) {
    toast.error(e)
  }
}

// Passo 5: lembretes
const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const reminder = reactive({ weekday: info.value?.church.reminderWeekday ?? 4, time: info.value?.church.reminderTime ?? '19:00' })
async function saveReminder() {
  try {
    await capi('', { method: 'PATCH', body: { reminderEnabled: true, reminderWeekday: reminder.weekday, reminderTime: reminder.time } })
    // Enquanto o canal oficial não está pronto, tudo roda em simulação (nada sai de verdade).
    if (!info.value?.whatsappMode || info.value.whatsappMode === 'disabled') await capi('/whatsapp', { method: 'PATCH', body: { mode: 'simulation' } })
    await refreshInfo()
    step.value = 6
  } catch (e) {
    toast.error(e)
  }
}

// Fim
const dutyCount = computed(() => chosen.value.size)
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
  <main
    id="conteudo"
    class="door"
  >
    <div class="door__card door__card--lg stack-lg">
      <div
        class="row"
        style="flex-wrap:nowrap;gap:12px"
      >
        <button
          v-if="step > 1"
          type="button"
          class="icon-btn icon-btn--round"
          style="background:#fff;border:1.5px solid var(--control)"
          aria-label="Voltar"
          @click="step--"
        >
          <Icon
            name="arrow-left"
            :weight="2"
          />
        </button>
        <p
          class="grow strong muted"
          style="font-size:14px"
        >
          Configuração inicial · passo {{ step }} de 6
        </p>
        <span
          class="dots"
          aria-hidden="true"
        ><span
          v-for="n in 6"
          :key="n"
          :class="{ on: n <= step }"
        /></span>
      </div>

      <template v-if="step === 1">
        <div>
          <h1
            class="h1"
            style="font-size:30px"
          >
            Boas-vindas à Guilda, {{ firstName }}!
          </h1>
          <p
            class="soft"
            style="margin-top:8px"
          >
            Em uns 5 minutos sua igreja fica pronta para montar a primeira escala. Vamos passar por quatro coisas:
          </p>
        </div>
        <div
          class="grid-auto"
          style="gap:10px"
        >
          <div
            v-for="(t, i) in ['Nome, logo e cor da igreja', 'Funções que existem no culto', 'Quem serve na igreja', 'Lembretes pelo WhatsApp']"
            :key="t"
            class="row"
            style="flex-wrap:nowrap;gap:12px;background:var(--surface-3);border-radius:16px;padding:12px 14px"
          >
            <span class="mark mark--now">{{ i + 1 }}</span>
            <p style="font-weight:700">
              {{ t }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="btn"
          style="align-self:flex-start"
          @click="step = 2"
        >
          Vamos começar<Icon
            name="arrow-right"
            :weight="2.2"
          />
        </button>
      </template>

      <template v-else-if="step === 2">
        <div>
          <h1
            class="h1"
            style="font-size:26px"
          >
            Como sua igreja se chama?
          </h1>
          <p
            class="soft"
            style="margin-top:8px"
          >
            O nome e o logo aparecem para todo mundo no app. A cor a gente tira do logo — e você ajusta se quiser.
          </p>
        </div>
        <label class="field"><span class="field__label">Nome da igreja</span><input
          v-model="form.name"
          class="input input--lg"
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
          Continuar
        </button>
      </template>

      <template v-else-if="step === 3">
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
          Continuar
        </button>
      </template>

      <template v-else-if="step === 4">
        <div>
          <h1
            class="h1"
            style="font-size:26px"
          >
            Quem serve na igreja?
          </h1>
          <p
            class="soft"
            style="margin-top:8px"
          >
            Comece com algumas pessoas — nome e celular bastam. As funções de cada uma você marca depois, e cada pessoa recebe um convite para criar a senha.
          </p>
        </div>
        <form
          class="row"
          style="gap:8px"
          @submit.prevent="addPerson"
        >
          <input
            v-model="np.name"
            class="input"
            style="flex:1 1 160px;width:auto;border-radius:14px"
            placeholder="Nome"
            aria-label="Nome"
          >
          <input
            v-model="np.phone"
            class="input"
            type="tel"
            style="flex:1 1 160px;width:auto;border-radius:14px"
            placeholder="(51) 99999-9999"
            aria-label="Celular"
          >
          <button
            class="btn btn--dark btn--sm"
            style="min-height:48px;border-radius:14px"
          >
            Adicionar
          </button>
        </form>
        <div
          class="stack-sm"
          style="gap:6px"
        >
          <div
            v-for="p in people"
            :key="p.id"
            class="row"
            style="flex-wrap:nowrap;gap:12px;padding:8px 12px;background:var(--surface-3);border-radius:14px"
          >
            <span class="av av--md">{{ initials(p.displayName) }}</span>
            <span
              class="grow"
              style="font-weight:700"
            >{{ p.displayName }}</span>
            <span
              class="muted"
              style="font-size:13.5px"
            >{{ p.phone ?? 'sem telefone' }}</span>
          </div>
        </div>
        <div class="row">
          <button
            type="button"
            class="btn"
            @click="step = 5"
          >
            Continuar com {{ people.length }}
          </button>
          <NuxtLink
            :to="link('/coordenacao/importar')"
            class="btn btn--secondary"
            style="font-size:15px"
          >
            <Icon
              name="upload"
              :weight="1.9"
              style="width:18px;height:18px"
            />Importar da planilha
          </NuxtLink>
        </div>
      </template>

      <template v-else-if="step === 5">
        <div>
          <h1
            class="h1"
            style="font-size:26px"
          >
            Lembretes pelo WhatsApp
          </h1>
          <p
            class="soft"
            style="margin-top:8px"
          >
            Toda semana, cada pessoa escalada recebe uma mensagem com as próprias tarefas. Só quem autorizar recebe.
          </p>
        </div>
        <p
          v-if="info?.whatsappMode !== 'cloud_api' && info?.whatsappMode !== 'ycloud'"
          class="panel panel--wait"
          style="border-radius:18px;padding:14px 16px;font-size:15px"
        >
          <strong>Por enquanto, tudo em modo de teste:</strong> nenhuma mensagem sai de verdade. Quando você quiser ligar, a gente te guia para conectar o número oficial da igreja.
        </p>
        <div>
          <p class="field__label">
            Que dia da semana?
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
          Continuar
        </button>
      </template>

      <template v-else>
        <div style="text-align:center;padding:8px 0">
          <span
            class="mark mark--done"
            style="width:72px;height:72px;margin:0 auto"
          ><Icon
            name="check"
            :weight="2.6"
            style="width:34px;height:34px"
          /></span>
          <h1
            class="h1"
            style="margin-top:16px;font-size:28px"
          >
            Tudo pronto, {{ firstName }}!
          </h1>
          <p
            class="soft"
            style="margin:8px auto 0;max-width:420px"
          >
            A {{ churchName }} tem {{ plural(dutyCount, 'função', 'funções') }} e {{ plural(people.length, 'pessoa cadastrada', 'pessoas cadastradas') }}. Agora vem a parte boa: preparar o primeiro mês.
          </p>
        </div>
        <div
          class="row"
          style="justify-content:center"
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
            Ir para a mesa
          </button>
        </div>
      </template>
    </div>
  </main>
</template>
