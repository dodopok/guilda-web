<script setup lang="ts">
import type { Task } from '~/types'

const props = defineProps<{ task: Task, busy?: boolean }>()
const emit = defineEmits<{ (e: 'confirm' | 'decline'): void }>()
const { tz, link } = useChurch()
const arrival = computed(() => (props.task.arrivalAt ? time(props.task.arrivalAt, tz.value) : null))
</script>

<template>
  <div class="task">
    <div
      class="row row--between"
      style="align-items:baseline"
    >
      <NuxtLink
        :to="link(`/tarefas/${task.assignmentId}`)"
        class="task__name"
        style="color:inherit;text-decoration:none"
      >
        {{ task.duty.name }}
      </NuxtLink>
      <StatusMark :status="task.status" />
    </div>
    <div class="task__meta">
      <span><Icon name="clock" />{{ arrival ? `chegar às ${arrival}` : 'chegada a combinar' }}</span>
      <span>{{ task.service.title }}, {{ time(task.service.startsAt, tz) }}</span>
      <span v-if="task.service.location"><Icon name="pin" />{{ task.service.location }}</span>
    </div>
    <p
      v-if="task.openSwaps.length"
      class="small"
      style="margin-top:.35rem;color:var(--info)"
    >
      <Icon
        name="swap"
        style="width:1rem;height:1rem;vertical-align:-0.15em"
      />
      Aguardando {{ task.openSwaps.map((s) => s.candidateName).join(', ') }} responder ao pedido de troca.
    </p>
    <div class="task__actions row">
      <template v-if="task.status === 'pending'">
        <button
          type="button"
          class="btn btn--ok btn--small"
          :disabled="busy"
          @click="emit('confirm')"
        >
          <Icon name="check" /> Confirmar
        </button>
        <button
          type="button"
          class="btn btn--no btn--small"
          :disabled="busy"
          @click="emit('decline')"
        >
          Não posso
        </button>
      </template>
      <template v-else-if="task.status === 'declined'">
        <button
          type="button"
          class="btn btn--small"
          :disabled="busy"
          @click="emit('confirm')"
        >
          Posso sim, confirmar
        </button>
      </template>
      <NuxtLink
        class="btn btn--quiet btn--small"
        :to="link(`/tarefas/${task.assignmentId}`)"
      >
        Instruções{{ task.status === 'confirmed' ? ' e trocas' : '' }}
      </NuxtLink>
    </div>
  </div>
</template>
