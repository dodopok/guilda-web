<script setup lang="ts">
import type { Duty } from '~/types'

useHead({ title: 'Editar modelo' })
const route = useRoute()
const id = String(route.params.id)
const { capi, link } = useChurch()
const toast = useToast()

interface Block { key: string, type: string, title: string, body: string | null, textSource: string, dutyId: string | null }
interface TemplateFull { id: string, name: string, kind: string, description: string | null, blocks: (Omit<Block, 'key'> & { id: string })[] }
const { data, refresh } = await useAsyncData(`template-${id}`, async () => {
  const [t, c] = await Promise.all([capi<{ template: TemplateFull }>(`/templates/${id}`), capi<{ duties: Duty[] }>('/catalog')])
  return { template: t.template, duties: c.duties.filter((d) => d.active) }
})

const form = reactive({ name: '', kind: 'regular', description: null as string | null })
const blocks = ref<Block[]>([])
const baseline = ref('')
const openKey = ref<string | null>(null)
const ser = () => JSON.stringify([form, blocks.value.map((b) => [b.type, b.title, b.body, b.textSource, b.dutyId])])
watch(data, (d) => {
  const t = d?.template
  if (!t) return
  Object.assign(form, { name: t.name, kind: t.kind, description: t.description })
  blocks.value = t.blocks.map((b) => ({ key: b.id, type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId }))
  baseline.value = ser()
}, { immediate: true })
const dirty = computed(() => ser() !== baseline.value)
onBeforeRouteLeave(() => (dirty.value ? window.confirm('Sair sem salvar o modelo?') : true))

const dutyName = (dutyId: string | null) => data.value?.duties.find((d) => d.id === dutyId)?.name
function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= blocks.value.length) return
  const list = [...blocks.value]
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  blocks.value = list
}
function remove(i: number) {
  blocks.value = blocks.value.filter((_, k) => k !== i)
}
const adding = ref(false)
function add(type: string) {
  const k = BLOCK_KINDS[type]!
  const key = `new-${Date.now()}`
  blocks.value = [...blocks.value, { key, type, title: k.label, body: null, textSource: k.source, dutyId: null }]
  adding.value = false
  openKey.value = key
}

const saving = ref(false)
async function save() {
  if (form.name.trim().length < 2) {
    toast.error('Dê um nome ao modelo.')
    return
  }
  saving.value = true
  try {
    await capi(`/templates/${id}`, { method: 'PATCH', body: { name: form.name, kind: form.kind, blocks: blocks.value.map((b) => ({ type: b.type, title: b.title.trim() || BLOCK_KINDS[b.type]!.label, body: b.textSource === 'estevao' ? null : b.body, textSource: b.textSource, dutyId: b.dutyId })) } })
    toast.ok('Modelo salvo. Roteiros já criados não mudam.')
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="data"
    class="stack-md w-760"
  >
    <div>
      <BackLink
        :to="link('/coordenacao/modelos')"
        label="Modelos"
      />
      <input
        v-model="form.name"
        class="title-input"
        aria-label="Nome do modelo"
        maxlength="120"
      >
      <p class="lede">
        Toque em um bloco para editar. Setas mudam a ordem.
      </p>
    </div>

    <div
      class="row"
      style="gap:6px"
      role="radiogroup"
      aria-labelledby="kind-label"
    >
      <span
        id="kind-label"
        class="strong muted"
        style="font-size:13.5px;font-weight:700;margin-right:4px"
      >Tipo de culto</span>
      <button
        v-for="(l, k) in TEMPLATE_KIND"
        :key="k"
        type="button"
        role="radio"
        class="chip"
        :aria-checked="form.kind === k"
        :aria-pressed="form.kind === k"
        @click="form.kind = k"
      >
        {{ l }}
      </button>
    </div>

    <ol
      v-if="blocks.length"
      class="stack-sm"
      style="list-style:none;margin:0;padding:0;gap:8px"
    >
      <li
        v-for="(b, i) in blocks"
        :key="b.key"
        class="card card--flush"
      >
        <div
          class="row"
          style="gap:10px;padding:10px 12px 10px 10px;flex-wrap:nowrap"
        >
          <span
            class="stack-sm"
            style="gap:3px"
          >
            <button
              type="button"
              class="arrowbtn"
              :aria-label="`Subir ${b.title}`"
              :disabled="i === 0"
              @click="move(i, -1)"
            ><Icon
              name="chevron-up"
              :weight="2.2"
            /></button>
            <button
              type="button"
              class="arrowbtn"
              :aria-label="`Descer ${b.title}`"
              :disabled="i === blocks.length - 1"
              @click="move(i, 1)"
            ><Icon
              name="chevron-down"
              :weight="2.2"
            /></button>
          </span>
          <button
            type="button"
            class="row"
            style="flex:1;min-width:0;gap:10px;flex-wrap:nowrap;border:0;background:transparent;padding:4px 0;text-align:left;color:inherit"
            :aria-expanded="openKey === b.key"
            @click="openKey = openKey === b.key ? null : b.key"
          >
            <span
              class="stag"
              :style="{ background: BLOCK_KINDS[b.type]?.bg, color: BLOCK_KINDS[b.type]?.fg, flex: 'none' }"
            >{{ BLOCK_KINDS[b.type]?.label ?? b.type }}</span>
            <span style="flex:1;min-width:0">
              <span
                class="strong"
                style="display:block"
              >{{ b.title }}</span>
              <span
                class="muted"
                style="display:block;font-size:13px"
              >{{ SOURCE_SHORT[b.textSource] ?? b.textSource }}{{ dutyName(b.dutyId) ? ` · ${dutyName(b.dutyId)}` : '' }}</span>
            </span>
            <Icon
              :name="openKey === b.key ? 'chevron-up' : 'chevron-down'"
              class="listrow__chev"
            />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn--round icon-btn--sm"
            style="background:var(--surface-2);color:var(--muted)"
            :aria-label="`Tirar ${b.title}`"
            @click="remove(i)"
          >
            <Icon
              name="x"
              :weight="2.2"
            />
          </button>
        </div>
        <div
          v-if="openKey === b.key"
          class="stack-md"
          style="padding:12px 14px 14px;border-top:1px solid var(--line-2)"
        >
          <label class="field">
            <span class="field__label">Título</span>
            <input
              v-model="b.title"
              class="input"
              maxlength="200"
            >
          </label>
          <div>
            <span class="field__label">De onde vem o texto</span>
            <div
              class="chips"
              role="radiogroup"
              :aria-label="`Origem do texto de ${b.title}`"
            >
              <button
                v-for="(l, s) in SOURCE_SHORT"
                :key="s"
                type="button"
                role="radio"
                class="chip"
                :aria-checked="b.textSource === s"
                :aria-pressed="b.textSource === s"
                @click="b.textSource = s"
              >
                {{ l }}
              </button>
            </div>
          </div>
          <label
            v-if="b.textSource !== 'estevao'"
            class="field"
          >
            <span class="field__label">Texto</span>
            <textarea
              :value="b.body ?? ''"
              class="textarea"
              style="min-height:100px;resize:vertical;font-size:15.5px"
              placeholder="O que vai no roteiro"
              @input="b.body = ($event.target as HTMLTextAreaElement).value || null"
            />
            <span
              v-if="b.textSource === 'loc_manual'"
              class="field__hint"
            >Texto do LOC digitado pela igreja, para uso interno. Não é distribuído a outras igrejas.</span>
          </label>
          <p
            v-else
            class="soft"
            style="font-size:14px;background:var(--surface-2);border-radius:12px;padding:10px 12px"
          >
            O texto chega do Estêvão a cada domingo — não precisa digitar.
          </p>
          <label class="field">
            <span class="field__label">Quem faz</span>
            <select
              v-model="b.dutyId"
              class="select"
            >
              <option :value="null">Ninguém em especial</option>
              <option
                v-for="d in data.duties"
                :key="d.id"
                :value="d.id"
              >{{ d.name }}</option>
            </select>
          </label>
        </div>
      </li>
    </ol>
    <div
      v-else
      class="card--dashed soft"
      style="padding:24px 20px"
    >
      Este modelo ainda não tem blocos. Comece acrescentando um.
    </div>

    <button
      type="button"
      class="btn btn--secondary btn--sm"
      style="align-self:flex-start;min-height:44px;font-size:15px"
      @click="adding = true"
    >
      <Icon
        name="plus"
        :weight="2.2"
        style="width:16px;height:16px"
      />Acrescentar bloco
    </button>

    <div class="savebar">
      <span
        v-if="dirty"
        class="small muted"
      >Alterações não salvas</span>
      <button
        type="button"
        class="btn btn--float"
        :disabled="saving"
        @click="save"
      >
        Salvar modelo
      </button>
    </div>

    <Sheet
      v-model:open="adding"
      title="Que tipo de bloco?"
    >
      <div
        style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:14px"
      >
        <button
          v-for="(k, t) in BLOCK_KINDS"
          :key="t"
          type="button"
          class="suggest"
          @click="add(t)"
        >
          <span
            class="stag"
            :style="{ background: k.bg, color: k.fg }"
          >{{ k.label }}</span>
          <span
            class="soft"
            style="font-size:13px"
          >{{ k.sub }}</span>
        </button>
      </div>
    </Sheet>
  </div>
</template>
