<script setup lang="ts">
import type { Task } from '~/types'

const props = defineProps<{ task: Task | null, busy?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'decline', note: string): void }>()
const { link, tz } = useChurch()
const note = ref('')
const open = computed({ get: () => Boolean(props.task), set: (v) => { if (!v) emit('close') } })
watch(() => props.task, () => { note.value = '' })
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Não vai conseguir?"
  >
    <template v-if="task">
      <p class="ink-2">
        <strong>{{ task.duty.name }}</strong> — {{ longDate(task.service.startsAt, tz) }}, {{ task.service.title }}.
      </p>
      <div
        class="notice"
        style="margin-top:1rem"
      >
        <p>Se alguém habilitado puder assumir, você pode pedir diretamente. A troca vale assim que a pessoa aceitar.</p>
        <div class="row">
          <NuxtLink
            class="btn btn--small"
            :to="link(`/tarefas/${task.assignmentId}#troca`)"
            @click="emit('close')"
          >
            <Icon name="swap" /> Pedir para alguém assumir
          </NuxtLink>
        </div>
      </div>
      <div
        class="field"
        style="margin-top:1.25rem"
      >
        <label
          class="field__label"
          for="decline-note"
        >Quer deixar um recado para a coordenação?</label>
        <textarea
          id="decline-note"
          v-model="note"
          class="textarea"
          maxlength="500"
          placeholder="Opcional"
        />
      </div>
    </template>
    <template #foot>
      <button
        type="button"
        class="btn"
        @click="open = false"
      >
        Voltar
      </button>
      <button
        type="button"
        class="btn btn--no"
        :disabled="busy"
        @click="emit('decline', note)"
      >
        Avisar que não posso
      </button>
    </template>
  </Sheet>
</template>
