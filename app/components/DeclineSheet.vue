<script setup lang="ts">
import type { Task } from '~/types'

const props = defineProps<{ task: Task | null, busy?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'decline', note: string): void }>()
const { link } = useChurch()
const note = ref('')
const open = computed({ get: () => Boolean(props.task), set: (v) => { if (!v) emit('close') } })
watch(() => props.task, () => { note.value = '' })
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Avisar que não pode"
    lede="Sem problema — a coordenação vai procurar alguém. Se quiser, conte o motivo (só a coordenação vê)."
  >
    <template v-if="task">
      <label
        class="sr-only"
        for="decline-note"
      >Motivo (opcional)</label>
      <textarea
        id="decline-note"
        v-model="note"
        class="textarea"
        maxlength="500"
        placeholder="Opcional. Ex.: viagem em família"
      />
      <div
        class="row"
        style="margin-top:14px"
      >
        <button
          type="button"
          class="btn btn--danger grow"
          style="min-height:50px"
          :disabled="busy"
          @click="emit('decline', note)"
        >
          Avisar que não posso
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          style="min-height:50px"
          @click="open = false"
        >
          Voltar
        </button>
      </div>
      <p
        class="small soft"
        style="margin-top:14px"
      >
        Conhece alguém que pode assumir?
        <NuxtLink
          :to="link(`/tarefas/${task.assignmentId}#troca`)"
          class="link"
          @click="emit('close')"
        >Pedir para essa pessoa</NuxtLink>
      </p>
    </template>
  </Sheet>
</template>
