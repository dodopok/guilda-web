<script setup lang="ts">
useHead({ title: 'Modelos de liturgia' })
const route = useRoute()
const { capi, link } = useChurch()
const toast = useToast()
interface T { id: string, name: string, kind: string, description: string | null, archived: boolean, blockCount: number }
const { data, refresh } = await useAsyncData(`templates-${route.params.slug}`, () => capi<{ templates: T[] }>('/templates'))
const KIND: Record<string, string> = { regular: 'comum', special: 'especial', short: 'curto' }
const form = reactive({ name: '', kind: 'regular' })
async function create() {
  try {
    const r = await capi<{ template: T }>('/templates', { method: 'POST', body: { name: form.name, kind: form.kind, blocks: [] } })
    await navigateTo(link(`/coordenacao/modelos/${r.template.id}`))
  } catch (e) {
    toast.error(e)
  }
}
const dup = ref<T | null>(null)
const dupForm = reactive({ name: '', kind: 'special' })
const dupOpen = computed({ get: () => Boolean(dup.value), set: (v) => { if (!v) dup.value = null } })
function openDup(t: T) {
  dup.value = t
  Object.assign(dupForm, { name: `${t.name} (cópia)`, kind: t.kind })
}
async function duplicate() {
  if (!dup.value) return
  try {
    const r = await capi<{ template: T }>(`/templates/${dup.value.id}/duplicate`, { method: 'POST', body: dupForm })
    dup.value = null
    await navigateTo(link(`/coordenacao/modelos/${r.template.id}`))
  } catch (e) {
    toast.error(e)
  }
}
async function archive(t: T, archived: boolean) {
  try {
    await capi(`/templates/${t.id}`, { method: 'PATCH', body: { archived } })
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Cadastro
      </p>
      <h1>Modelos de liturgia</h1>
      <p class="lede">
        A estrutura de cada tipo de culto, com os textos do LOC que a coordenação cadastra. Duplique para celebrações especiais ou liturgias curtas.
      </p>
    </div>
    <div
      class="notice notice--wait"
      style="margin-bottom:1.5rem"
    >
      <p><strong>Direitos dos textos do LOC.</strong> Os textos ficam apenas nesta igreja. Antes de oferecer modelos a outras comunidades, confirme a permissão de exibição e redistribuição com quem detém os direitos.</p>
    </div>
    <ul class="lines">
      <li
        v-for="t in data?.templates ?? []"
        :key="t.id"
        class="line"
      >
        <span class="line__main">
          <NuxtLink
            :to="link(`/coordenacao/modelos/${t.id}`)"
            class="line__title"
            style="font-size:1.1rem"
          >{{ t.name }}</NuxtLink>
          <span
            class="tag tag--plain"
            style="margin-left:.4rem"
          >{{ KIND[t.kind] }}</span>
          <span
            v-if="t.archived"
            class="tag tag--plain"
            style="margin-left:.25rem"
          >arquivado</span>
          <span
            class="line__sub"
            style="display:block"
          >{{ t.description }}{{ t.description ? ' · ' : '' }}{{ plural(t.blockCount, 'bloco', 'blocos') }}</span>
        </span>
        <span
          class="row"
          style="gap:.35rem"
        >
          <button
            type="button"
            class="btn btn--small"
            @click="openDup(t)"
          >Duplicar</button>
          <button
            type="button"
            class="btn btn--quiet btn--small"
            @click="archive(t, !t.archived)"
          >{{ t.archived ? 'Reativar' : 'Arquivar' }}</button>
        </span>
      </li>
    </ul>
    <form
      class="notice notice--accent"
      style="margin-top:2rem"
      @submit.prevent="create"
    >
      <h3>Novo modelo</h3>
      <div
        class="row"
        style="align-items:flex-end"
      >
        <label
          class="field"
          style="margin:0;flex:1;min-width:14rem"
        ><span class="field__label">Nome</span><input
          v-model="form.name"
          class="input"
          required
          placeholder="Ex.: Quarta-feira de Cinzas"
        ></label>
        <label
          class="field"
          style="margin:0"
        ><span class="field__label">Tipo</span><select
          v-model="form.kind"
          class="select"
        ><option value="regular">Comum</option><option value="special">Especial</option><option value="short">Curto</option></select></label>
        <button class="btn btn--primary">
          Criar e editar
        </button>
      </div>
    </form>
    <Sheet
      v-model:open="dupOpen"
      title="Duplicar modelo"
    >
      <label class="field"><span class="field__label">Nome da cópia</span><input
        v-model="dupForm.name"
        class="input"
        required
      ></label>
      <label class="field"><span class="field__label">Tipo</span><select
        v-model="dupForm.kind"
        class="select"
      ><option value="regular">Comum</option><option value="special">Especial</option><option value="short">Curto</option></select></label>
      <template #foot>
        <button
          type="button"
          class="btn"
          @click="dup = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn--primary"
          @click="duplicate"
        >
          Duplicar e editar
        </button>
      </template>
    </Sheet>
  </div>
</template>
