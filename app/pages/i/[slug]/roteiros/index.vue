<script setup lang="ts">
// "Roteiro do culto": abre o roteiro do próximo culto (publicado, para quem só lê).
useHead({ title: 'Roteiro do culto' })
const route = useRoute()
const { capi, tz, link, isCoordinator, isPastor } = useChurch()
interface ScriptRow { serviceId: string, title: string, startsAt: string, status: string, script: { version: number } | null }
const months = [currentMonth(tz.value), shiftMonth(currentMonth(tz.value), 1)]
const { data } = await useAsyncData(`scripts-next-${route.params.slug}`, async () => {
  const lists = await Promise.all(months.map((m) => capi<{ scripts: ScriptRow[] }>(`/scripts?month=${m}`)))
  return lists.flatMap((l) => l.scripts)
})
const cutoff = Date.now() - 3 * 3600_000
const editor = isCoordinator.value || isPastor.value
const upcoming = computed(() => (data.value ?? []).filter((s) => s.status === 'scheduled' && Date.parse(s.startsAt) >= cutoff))
const target = computed(() => (editor ? upcoming.value[0] : upcoming.value.find((s) => s.script?.version)) ?? null)
if (target.value) await navigateTo(link(`/roteiros/${target.value.serviceId}`), { replace: true })
</script>

<template>
  <section class="stack-lg">
    <div>
      <p class="eyebrow">
        Roteiro do culto
      </p>
      <h1 class="h1--sm">
        Nenhum roteiro por enquanto
      </h1>
    </div>
    <div class="card--dashed">
      <p
        class="strong"
        style="font-size:18px"
      >
        O próximo roteiro aparece aqui quando for publicado
      </p>
      <p
        class="soft"
        style="margin:6px auto 0;max-width:400px"
      >
        Quem faz o quê, leituras e músicas do culto.
      </p>
    </div>
  </section>
</template>
