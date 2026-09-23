<script setup lang="ts">
const route = useRoute()
const { link, isCoordinator, tz } = useChurch()
if (!isCoordinator.value) await navigateTo(link(''), { replace: true })

// Mês de trabalho: a partir do dia 10 a coordenação normalmente prepara o mês seguinte.
const workMonth = computed(() => {
  const now = currentMonth(tz.value)
  const day = Number(localDateKey(new Date(), tz.value).slice(8, 10))
  return day >= 10 ? shiftMonth(now, 1) : now
})
const groups = computed(() => [
  { title: null, items: [
    { to: link('/coordenacao'), label: 'Mesa', exact: true },
    { to: link('/coordenacao/pendencias'), label: 'Pendências' },
  ] },
  { title: 'Mês a mês', items: [
    { to: link(`/coordenacao/cultos/${workMonth.value}`), match: '/coordenacao/cultos', label: 'Cultos' },
    { to: link(`/coordenacao/disponibilidade/${workMonth.value}`), match: '/coordenacao/disponibilidade', label: 'Indisponibilidade' },
    { to: link(`/coordenacao/escalas/${workMonth.value}`), match: '/coordenacao/escalas', label: 'Escala' },
    { to: link('/coordenacao/roteiros'), label: 'Roteiros' },
  ] },
  { title: 'Cadastro', items: [
    { to: link('/coordenacao/pessoas'), label: 'Pessoas' },
    { to: link('/coordenacao/funcoes'), label: 'Funções' },
    { to: link('/coordenacao/modelos'), label: 'Modelos de liturgia' },
    { to: link('/coordenacao/repertorio'), label: 'Repertório' },
    { to: link('/coordenacao/importar'), label: 'Importar planilha' },
  ] },
  { title: 'Comunicação', items: [
    { to: link('/coordenacao/mensagens'), label: 'Mensagens' },
    { to: link('/coordenacao/whatsapp'), label: 'Canal do WhatsApp' },
    { to: link('/coordenacao/configuracoes'), label: 'Configurações' },
    { to: link('/coordenacao/historico'), label: 'Histórico' },
  ] },
])
function active(item: { to: string, exact?: boolean, match?: string }) {
  if (item.exact) return route.path === item.to
  const base = item.match ? link(item.match) : item.to
  return route.path.startsWith(base)
}
</script>

<template>
  <div class="desk">
    <nav
      class="desk__index no-print"
      aria-label="Coordenação"
    >
      <ol>
        <template
          v-for="(g, gi) in groups"
          :key="gi"
        >
          <li
            v-if="g.title"
            class="index-group kicker"
            aria-hidden="true"
          >
            {{ g.title }}
          </li>
          <li
            v-for="item in g.items"
            :key="item.label"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="active(item) ? 'page' : undefined"
              active-class=""
              exact-active-class=""
            >{{ item.label }}</NuxtLink>
          </li>
        </template>
      </ol>
    </nav>
    <NuxtPage />
  </div>
</template>
