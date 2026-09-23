<script setup lang="ts">
useHead({ title: 'Modelos de liturgia' })
const route = useRoute()
const { capi, link } = useChurch()
const toast = useToast()
interface T { id: string, name: string, kind: string, description: string | null, archived: boolean, blockCount: number }
const { data, refresh } = await useAsyncData(`templates-${route.params.slug}`, () => capi<{ templates: T[] }>('/templates'))
const active = computed(() => (data.value?.templates ?? []).filter((t) => !t.archived))
const archived = computed(() => (data.value?.templates ?? []).filter((t) => t.archived))

const busy = ref(false)
async function create() {
  busy.value = true
  try {
    const r = await capi<{ template: T }>('/templates', { method: 'POST', body: { name: 'Novo modelo', kind: 'regular', blocks: [] } })
    await navigateTo(link(`/coordenacao/modelos/${r.template.id}`))
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function duplicate(t: T) {
  try {
    await capi(`/templates/${t.id}/duplicate`, { method: 'POST', body: { name: `${t.name} (cópia)`.slice(0, 120), kind: t.kind } })
    toast.ok(`“${t.name}” duplicado.`)
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function setArchived(t: T, value: boolean) {
  try {
    await capi(`/templates/${t.id}`, { method: 'PATCH', body: { archived: value } })
    toast.ok(value ? `“${t.name}” arquivado. Roteiros já criados não mudam.` : `“${t.name}” de volta.`)
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="stack-lg w-760">
    <PageHead
      title="Modelos de liturgia"
      lede="A ordem do culto que o roteiro usa de base."
      :back="link('/coordenacao/configuracoes')"
      back-label="Configurações"
    >
      <button
        type="button"
        class="btn btn--md"
        style="font-size:15px"
        :disabled="busy"
        @click="create"
      >
        <Icon
          name="plus"
          :weight="2.2"
          style="width:16px;height:16px"
        />Criar modelo
      </button>
    </PageHead>

    <div
      v-if="active.length"
      class="card card--flush rows"
    >
      <div
        v-for="t in active"
        :key="t.id"
        class="rowline rowline--center"
      >
        <NuxtLink
          :to="link(`/coordenacao/modelos/${t.id}`)"
          class="row"
          style="flex:1;min-width:220px;gap:12px;flex-wrap:nowrap;color:inherit;text-decoration:none"
        >
          <span
            class="ticon"
            style="width:44px;height:44px;border-radius:14px;font-weight:800;font-size:15px"
            aria-hidden="true"
          >{{ t.blockCount }}</span>
          <span style="flex:1;min-width:0">
            <span
              class="row"
              style="gap:8px"
            >
              <span
                class="strong"
                style="font-size:16px"
              >{{ t.name }}</span>
              <span class="tag">{{ TEMPLATE_KIND[t.kind] ?? t.kind }}</span>
            </span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ plural(t.blockCount, 'bloco', 'blocos') }}{{ t.description ? ` · ${t.description}` : '' }}</span>
          </span>
        </NuxtLink>
        <span
          class="row"
          style="gap:6px"
        >
          <button
            type="button"
            class="btn btn--line btn--xs"
            @click="duplicate(t)"
          >Duplicar</button>
          <button
            type="button"
            class="btn btn--line btn--xs"
            style="color:var(--muted)"
            @click="setArchived(t, true)"
          >Arquivar</button>
        </span>
      </div>
    </div>
    <EmptyState
      v-else
      title="Nenhum modelo ainda"
      text="Crie a ordem do culto uma vez; cada roteiro começa dela."
    />

    <details v-if="archived.length">
      <summary
        class="strong"
        style="cursor:pointer;font-weight:700;color:var(--muted);font-size:14.5px;list-style:none"
      >
        Arquivados ({{ archived.length }}) ›
      </summary>
      <div
        class="card card--flush rows"
        style="margin-top:8px"
      >
        <div
          v-for="t in archived"
          :key="t.id"
          class="rowline rowline--center"
        >
          <span
            class="strong soft"
            style="flex:1;font-weight:700"
          >{{ t.name }}</span>
          <button
            type="button"
            class="btn btn--line btn--xs"
            @click="setArchived(t, false)"
          >
            Restaurar
          </button>
        </div>
      </div>
    </details>
  </div>
</template>
