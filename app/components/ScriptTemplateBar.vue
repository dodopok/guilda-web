<script setup lang="ts">
import type { ScriptView } from '~/types'

// De onde veio o roteiro: modelo de origem, aviso quando o modelo mudou depois, funções da
// escala que ficaram fora e "refazer pelo modelo" (mantém o que já foi preenchido).
const props = defineProps<{ view: ScriptView, serviceId: string }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()
const { capi, link } = useChurch()
const toast = useToast()

const draft = computed(() => props.view.draft!)
const tpl = computed(() => draft.value.template)
const outside = computed(() => draft.value.dutiesOutside ?? [])

interface TemplateRow { id: string, name: string, kind: string, archived: boolean, blockCount: number }
const open = ref(false)
const templates = ref<TemplateRow[]>([])
const chosen = ref<string | null>(null)
async function start() {
  try {
    templates.value = (await capi<{ templates: TemplateRow[] }>('/templates')).templates.filter((t) => !t.archived)
    chosen.value = tpl.value && templates.value.some((t) => t.id === tpl.value!.id)
      ? tpl.value.id
      : (templates.value.find((t) => t.kind === props.view.service.kind) ?? templates.value[0])?.id ?? null
    open.value = true
  } catch (e) {
    toast.error(e)
  }
}
const busy = ref(false)
async function rebuild() {
  if (!chosen.value) return
  busy.value = true
  try {
    await capi(`/scripts/${props.serviceId}/rebuild`, { method: 'POST', body: { templateId: chosen.value } })
    toast.ok('Roteiro refeito pelo modelo. Publique para a equipe ver.')
    open.value = false
    emit('refresh')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '')
</script>

<template>
  <div
    class="tplbar"
    :class="{ 'tplbar--warn': tpl?.changedSince || outside.length }"
  >
    <div style="flex:1;min-width:220px">
      <p
        v-if="tpl?.changedSince"
        class="strong"
      >
        O modelo “{{ tpl.name }}” mudou depois deste roteiro.
      </p>
      <p v-else-if="tpl">
        Feito com o modelo <NuxtLink
          :to="link(`/coordenacao/modelos/${tpl.id}`)"
          class="strong"
        >“{{ tpl.name }}”</NuxtLink>.
      </p>
      <p v-else>
        Este roteiro não segue nenhum modelo.
      </p>
      <p
        v-if="outside.length"
        class="small"
        style="margin-top:2px"
      >
        Na escala, mas fora do roteiro: {{ listNames(outside.map((d) => d.name)) }}.
        <NuxtLink
          v-if="tpl"
          :to="link(`/coordenacao/modelos/${tpl.id}`)"
          class="strong"
        >Acrescentar no modelo</NuxtLink>
      </p>
    </div>
    <button
      type="button"
      class="btn btn--white btn--sm"
      @click="start"
    >
      {{ tpl?.changedSince ? 'Atualizar pelo modelo' : 'Refazer pelo modelo' }}
    </button>

    <Sheet
      v-model:open="open"
      title="Refazer pelo modelo"
      lede="A ordem e os blocos passam a ser os do modelo. O que já foi preenchido continua: nome do domingo, coleta, leituras e quem lê, pregador, músicas, avisos e ritos adaptados."
    >
      <div
        v-if="templates.length"
        class="stack-sm"
        role="radiogroup"
        aria-label="Modelo"
      >
        <label
          v-for="t in templates"
          :key="t.id"
          class="check"
        >
          <input
            v-model="chosen"
            type="radio"
            name="tpl"
            :value="t.id"
          >
          <span class="check__text">
            <span class="strong">{{ t.name }}</span>
            <span
              class="small muted"
              style="display:block"
            >{{ t.blockCount }} blocos</span>
          </span>
        </label>
      </div>
      <p
        v-else
        class="muted"
      >
        Ainda não há modelos. <NuxtLink
          :to="link('/coordenacao/modelos')"
          class="strong"
        >Criar um modelo</NuxtLink>
      </p>
      <p
        class="small muted"
        style="margin:12px 0"
      >
        Blocos que não existem no modelo saem do rascunho. O publicado só muda quando você publicar de novo; alterações ainda não salvas se perdem.
      </p>
      <button
        type="button"
        class="btn btn--block"
        :disabled="busy || !chosen"
        @click="rebuild"
      >
        Refazer o roteiro
      </button>
    </Sheet>
  </div>
</template>
