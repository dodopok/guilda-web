<script setup lang="ts">
import type { EditorSlot, ScheduleEditor } from '~/types'

// Passo 4: conferir e publicar. Nada impede publicar: são sinais para revisar. Depois de
// publicada, cada mudança gera nova versão e avisa só quem foi afetado.
const props = defineProps<{ editor: ScheduleEditor, month: string }>()
const emit = defineEmits<{ (e: 'refresh' | 'back'): void, (e: 'fix', serviceId: string): void }>()
const { capi, tz, link } = useChurch()
const toast = useToast()

const services = computed(() => props.editor.services.filter((s) => s.status === 'scheduled'))
const dutyName = (id: string) => props.editor.duties.find((d) => d.id === id)?.name ?? ''
const active = (sl: EditorSlot) => sl.assignments.filter((a) => a.status !== 'declined')
const totalReq = computed(() => services.value.reduce((n, s) => n + s.slots.reduce((m, x) => m + x.requiredCount, 0), 0))
const groups = computed(() => services.value.map((s) => {
  const open = s.slots.filter((x) => active(x).length < x.requiredCount)
  const missing = open.reduce((n, x) => n + x.requiredCount - active(x).length, 0)
  const names = open.slice(0, 4).map((x) => dutyName(x.dutyId)).join(', ') + (open.length > 4 ? ` e mais ${open.length - 4}` : '')
  return { id: s.id, label: `${longDate(s.startsAt, tz.value)} · ${time(s.startsAt, tz.value)}`, count: open.length, missing, names }
}).filter((g) => g.count > 0))
const vacancyCount = computed(() => groups.value.reduce((n, g) => n + g.missing, 0))
const noRest = computed(() => props.editor.loads.filter((l) => !l.restExempt && l.sundaysServed > 0 && l.sundaysFree === 0).map((l) => l.displayName))
const withoutTask = computed(() => props.editor.people.filter((p) => p.dutyIds.length && !p.roles.includes('pastor') && !props.editor.loads.find((l) => l.personId === p.id)?.tasks).map((p) => p.displayName))
// Demais sinais do servidor (choques, indisponíveis escalados, carga no mesmo dia...).
const SHOWN = new Set(['vacancy', 'no_rest', 'without_task'])
const otherAlerts = computed(() => props.editor.alerts.filter((a) => !SHOWN.has(a.type)))
const scheduledPeople = computed(() => new Set(services.value.flatMap((s) => s.slots.flatMap((x) => active(x).map((a) => a.personId)))).size)

const notify = ref<'yes' | 'no'>('yes')
const busy = ref(false)
async function publish() {
  busy.value = true
  try {
    await capi(`/schedule/${props.month}/publish`, { method: 'POST', body: { notifyNow: notify.value === 'yes' } })
    toast.ok(`Escala de ${monthName(props.month)} publicada!`)
    emit('refresh')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
const published = computed(() => props.editor.status === 'published')
</script>

<template>
  <div class="stack-md w-720">
    <template v-if="!published">
      <div>
        <h2 class="h2">
          Tudo pronto para publicar?
        </h2>
        <p class="lede">
          Nada aqui impede publicar. São só sinais para conferir.
        </p>
      </div>
      <div
        v-if="!groups.length"
        class="panel panel--ok row"
        style="flex-wrap:nowrap;border-radius:18px;padding:14px 16px"
      >
        <Icon
          name="check"
          :weight="2.2"
          style="width:22px;height:22px;flex:none;color:var(--ok)"
        />
        <p
          class="strong"
          style="color:var(--ok-ink)"
        >
          Todas as {{ totalReq }} vagas estão preenchidas.
        </p>
      </div>
      <div
        v-else
        class="card"
        style="border-color:var(--wait-line);padding:14px 16px"
      >
        <p
          class="strong row"
          style="gap:8px;color:var(--wait-ink);margin-bottom:6px"
        >
          <Icon
            name="alert"
            :weight="2"
            style="width:20px;height:20px;color:var(--wait)"
          />{{ plural(vacancyCount, 'vaga ainda aberta', 'vagas ainda abertas') }}
        </p>
        <p
          class="soft small"
          style="margin-bottom:8px"
        >
          Dá para publicar assim mesmo e completar depois — quem for escalado mais tarde recebe o aviso.
        </p>
        <div
          v-for="g in groups"
          :key="g.id"
          class="row"
          style="padding:10px 0;border-top:1px solid var(--surface-3)"
        >
          <span
            class="grow"
            style="min-width:200px"
          ><span
            class="strong"
            style="display:block;font-size:15px"
          >{{ g.label }}</span><span
            class="soft"
            style="display:block;font-size:13.5px"
          ><span style="color:var(--wait);font-weight:700">{{ plural(g.missing, 'vaga', 'vagas') }} em {{ plural(g.count, 'função', 'funções') }}</span> · {{ g.names }}</span></span>
          <button
            type="button"
            class="btn btn--line btn--xs"
            @click="emit('fix', g.id)"
          >
            Completar
          </button>
        </div>
      </div>
      <p
        v-if="noRest.length"
        class="panel panel--wait"
        style="border-radius:18px;padding:14px 16px;font-size:15px"
      >
        <strong>Sem domingo livre em {{ monthName(month) }}:</strong> {{ noRest.join(', ') }}. A folga é uma meta de cuidado, não uma regra.
      </p>
      <p
        v-if="withoutTask.length"
        class="card"
        style="border-radius:18px;padding:14px 16px;font-size:15px;color:var(--ink-2)"
      >
        <strong>Ficaram sem tarefa este mês:</strong> {{ withoutTask.join(', ') }}. Tudo bem — nem todo mundo precisa servir todo mês.
      </p>
      <div
        v-if="otherAlerts.length"
        class="card"
        style="border-radius:18px;padding:14px 16px"
      >
        <p
          class="strong"
          style="margin-bottom:6px"
        >
          Outros pontos para conferir
        </p>
        <p
          v-for="(a, i) in otherAlerts"
          :key="i"
          class="small"
          style="padding:6px 0;border-top:1px solid var(--surface-3)"
          :style="{ color: a.severity === 'strong' ? 'var(--no-ink)' : 'var(--ink-2)' }"
        >
          {{ a.message }}
        </p>
      </div>
      <div class="card">
        <p
          class="strong"
          style="margin-bottom:10px"
        >
          Avisar agora pelo WhatsApp?
        </p>
        <div
          class="stack-sm"
          role="radiogroup"
          aria-label="Avisar agora pelo WhatsApp"
        >
          <button
            v-for="o in [
              { v: 'yes' as const, t: `Sim, avisar as ${scheduledPeople} pessoas escaladas`, s: 'Cada uma recebe só as suas tarefas e o link para confirmar.' },
              { v: 'no' as const, t: 'Ainda não', s: 'A escala fica visível no app e o lembrete semanal segue normal.' },
            ]"
            :key="o.v"
            type="button"
            role="radio"
            class="radiocard"
            :aria-checked="notify === o.v"
            @click="notify = o.v"
          >
            <span class="radiocard__dot" />
            <span><span
              class="strong"
              style="display:block"
            >{{ o.t }}</span><span
              class="soft small"
              style="display:block"
            >{{ o.s }}</span></span>
          </button>
        </div>
      </div>
      <div class="row">
        <button
          type="button"
          class="btn"
          style="min-height:54px;padding:12px 24px"
          :disabled="busy || !services.length"
          @click="publish"
        >
          <Icon
            name="send"
            :weight="2"
          />Publicar a escala de {{ monthName(month) }}
        </button>
        <button
          type="button"
          class="link link--muted"
          style="font-size:14.5px;padding:8px 4px"
          @click="emit('back')"
        >
          Voltar e ajustar
        </button>
      </div>
    </template>
    <div
      v-else
      class="card card--lg"
      style="padding:28px 22px;text-align:center"
    >
      <span
        class="mark mark--done"
        style="width:64px;height:64px;margin:0 auto"
      ><Icon
        name="check"
        :weight="2.6"
        style="width:30px;height:30px"
      /></span>
      <h2
        style="margin-top:16px;font-size:24px"
      >
        A escala de {{ monthName(month) }} está no ar!
      </h2>
      <p
        class="soft"
        style="margin:6px auto 0;max-width:420px"
      >
        {{ plural(scheduledPeople, 'pessoa já pode', 'pessoas já podem') }} ver suas tarefas no app. Versão {{ editor.version }}. Mudanças a partir de agora geram uma nova versão e avisam só quem for afetado.
      </p>
      <div
        class="row"
        style="justify-content:center;margin-top:18px"
      >
        <NuxtLink
          :to="link(`/escala/${month}`)"
          class="btn btn--md"
        >
          Ver como voluntário
        </NuxtLink>
        <NuxtLink
          :to="link('/coordenacao')"
          class="btn btn--secondary btn--md"
        >
          Voltar à mesa
        </NuxtLink>
      </div>
      <p
        v-if="groups.length"
        class="small"
        style="margin-top:14px;color:var(--wait)"
      >
        Ainda há {{ plural(vacancyCount, 'vaga aberta', 'vagas abertas') }}. <button
          type="button"
          class="link"
          @click="emit('fix', groups[0]!.id)"
        >
          Completar
        </button>
      </p>
    </div>
  </div>
</template>
