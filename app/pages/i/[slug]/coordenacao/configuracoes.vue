<script setup lang="ts">
import type { Church } from '~/types'

useHead({ title: 'Configurações' })
const { capi, info, tz } = useChurch()
const toast = useToast()
const c = computed(() => info.value?.church)
const form = reactive({ name: '', timezone: '', defaultLocation: '', reminderEnabled: false, reminderWeekday: 4, reminderTime: '19:00', reminderWindowDays: 7, confirmationDeadlineHours: 48, liturgicalPrayerBook: 'loc_2027', liturgicalReadingType: 'complementary' })
watchEffect(() => {
  if (c.value) Object.assign(form, { ...c.value, defaultLocation: c.value.defaultLocation ?? '' })
})
// Próximo disparo calculado no fuso escolhido, para a coordenação conferir.
const nextRun = computed(() => {
  const now = new Date()
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getTime() + i * 86400_000)
    const key = localDateKey(d, form.timezone || tz.value)
    const wd = new Date(`${key}T12:00:00Z`).getUTCDay()
    if (wd !== Number(form.reminderWeekday)) continue
    const iso = zonedToIso(key, form.reminderTime, form.timezone || tz.value)
    if (new Date(iso) > now) return iso
  }
  return null
})
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const r = await capi<{ church: Church }>('', {
      method: 'PATCH',
      body: { ...form, defaultLocation: form.defaultLocation || null, reminderWeekday: Number(form.reminderWeekday), reminderWindowDays: Number(form.reminderWindowDays), confirmationDeadlineHours: Number(form.confirmationDeadlineHours) },
    })
    if (info.value) info.value.church = r.church
    toast.ok('Configurações salvas.')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
const ZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Noronha', 'America/Rio_Branco', 'Europe/Lisbon']
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Comunicação
      </p>
      <h1>Configurações</h1>
    </div>
    <form @submit.prevent="save">
      <section>
        <div class="section-head">
          <h2>Igreja</h2>
        </div>
        <div style="margin-top:1rem">
          <label class="field"><span class="field__label">Nome</span><input
            v-model="form.name"
            class="input"
            required
          ></label>
          <div
            class="fields-2"
            style="margin-top:1.1rem"
          >
            <label class="field"><span class="field__label">Fuso horário</span>
              <select
                v-model="form.timezone"
                class="select"
              ><option
                v-for="z in ZONES"
                :key="z"
                :value="z"
              >{{ z.replace('_', ' ') }}</option></select>
            </label>
            <label class="field"><span class="field__label">Local padrão dos cultos</span><input
              v-model="form.defaultLocation"
              class="input"
            ></label>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Lembrete semanal</h2>
        </div>
        <label
          class="check"
          style="margin-top:.75rem"
        ><input
          v-model="form.reminderEnabled"
          type="checkbox"
        ><span class="check__text"><strong>Enviar lembrete automático</strong><span
          class="small muted"
          style="display:block"
        >Uma mensagem por pessoa, com todas as tarefas dos próximos dias. Mudanças depois do envio geram correção só para quem foi afetado.</span></span></label>
        <div
          class="fields-2"
          style="margin-top:1rem"
        >
          <label class="field"><span class="field__label">Dia</span>
            <select
              v-model="form.reminderWeekday"
              class="select"
            ><option
              v-for="(d, i) in WEEKDAYS"
              :key="i"
              :value="i"
            >{{ d }}</option></select>
          </label>
          <label class="field"><span class="field__label">Horário</span><input
            v-model="form.reminderTime"
            class="input"
            type="time"
            required
          ></label>
        </div>
        <label
          class="field"
          style="margin-top:1.1rem"
        ><span class="field__label">Janela (dias seguintes ao envio)</span><input
          v-model="form.reminderWindowDays"
          class="input"
          type="number"
          min="1"
          max="14"
          style="max-width:8rem"
        ></label>
        <p
          v-if="form.reminderEnabled && nextRun"
          class="notice notice--accent"
          style="margin-top:1rem"
        >
          Próximo envio: <strong>{{ longDate(nextRun, form.timezone) }}, às {{ time(nextRun, form.timezone) }}</strong> ({{ form.timezone }}).
        </p>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Confirmações</h2>
        </div>
        <label
          class="field"
          style="margin-top:1rem"
        ><span class="field__label">Pedir resposta até quantas horas antes do culto</span><input
          v-model="form.confirmationDeadlineHours"
          class="input"
          type="number"
          min="0"
          max="336"
          style="max-width:8rem"
        ></label>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Liturgia (Estêvão)</h2>
        </div>
        <div
          class="fields-2"
          style="margin-top:1rem"
        >
          <label class="field"><span class="field__label">Livro de oração</span><input
            v-model="form.liturgicalPrayerBook"
            class="input"
          ></label>
          <label class="field"><span class="field__label">Leituras</span>
            <select
              v-model="form.liturgicalReadingType"
              class="select"
            ><option value="complementary">Complementares</option><option value="semicontinuous">Semicontínuas</option></select>
          </label>
        </div>
      </section>
      <button
        class="btn btn--primary"
        style="margin-top:2rem"
        :disabled="saving"
      >
        Salvar configurações
      </button>
    </form>
  </div>
</template>
