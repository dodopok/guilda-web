<script setup lang="ts">
useHead({ title: 'Nova igreja · Guilda' })
const { me, load } = useSession()
if (!me.value?.account.isPlatformAdmin) await navigateTo('/')
const toast = useToast()
const form = reactive({ name: '', slug: '', city: '', coordName: '', coordPhone: '' })
const slugEdited = ref(false)
watch(() => form.name, (n) => {
  if (!slugEdited.value) form.slug = n.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
})
const origin = import.meta.client ? window.location.host : ''
const created = ref<{ slug: string, name: string, inviteLink: string | null } | null>(null)
const busy = ref(false)
async function submit() {
  if (form.name.trim().length < 2 || !form.slug || form.coordName.trim().length < 2 || form.coordPhone.replace(/\D/g, '').length < 8) {
    toast.error('Preencha o nome da igreja e o nome e o celular de quem coordena.')
    return
  }
  busy.value = true
  try {
    const r = await api<{ church: { slug: string, name: string }, inviteLink: string | null }>('/churches', {
      method: 'POST',
      body: { name: form.name, slug: form.slug, city: form.city || undefined, coordinator: { displayName: form.coordName, phone: form.coordPhone } },
    })
    created.value = { slug: r.church.slug, name: r.church.name, inviteLink: r.inviteLink }
    await load(true)
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.ok('Copiado.')
  } catch {
    toast.error('Não consegui copiar. Selecione e copie à mão.')
  }
}
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <div
      class="door__card stack-md"
      style="max-width:520px;gap:14px"
    >
      <div>
        <BackLink
          to="/"
          label="Igrejas"
        />
        <h1 style="font-size:26px;line-height:1.15">
          Nova igreja
        </h1>
        <p
          class="soft"
          style="margin-top:4px"
        >
          Em um minuto ela já tem coordenação e pode começar.
        </p>
      </div>

      <template v-if="created">
        <div
          class="panel panel--ok stack-sm"
          role="status"
        >
          <p class="strong">
            {{ created.name }} criada em /i/{{ created.slug }}.
          </p>
          <template v-if="created.inviteLink">
            <p>
              A igreja nova ainda não tem WhatsApp ligado, então o convite <strong>não foi enviado</strong>. Entregue este link só à pessoa da coordenação — vale 72 horas, é de uso único e não aparece de novo:
            </p>
            <div
              class="row"
              style="gap:8px"
            >
              <code
                class="mono"
                style="flex:1;min-width:200px;padding:10px 12px;border-radius:12px;background:#fff;word-break:break-all"
              >{{ created.inviteLink }}</code>
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                @click="copy(created.inviteLink)"
              >
                Copiar
              </button>
            </div>
          </template>
          <p v-else>
            Você mesmo já faz parte da coordenação desta igreja.
          </p>
        </div>
        <NuxtLink
          :to="created.inviteLink ? '/' : `/i/${created.slug}`"
          class="btn"
        >
          {{ created.inviteLink ? 'Voltar para as igrejas' : 'Abrir a igreja' }}
        </NuxtLink>
      </template>

      <form
        v-else
        class="stack-md"
        style="gap:14px"
        novalidate
        @submit.prevent="submit"
      >
        <label class="field"><span class="field__label">Nome da igreja</span><input
          v-model="form.name"
          class="input"
          placeholder="Ex.: Anglicana Porto"
          maxlength="120"
        ></label>
        <p
          class="soft"
          style="margin-top:-4px;font-size:14px;background:var(--surface-2);border-radius:12px;padding:10px 12px"
        >
          Endereço no app: <strong style="color:var(--ink)">{{ origin }}/i/{{ form.slug || '…' }}</strong>
        </p>
        <details>
          <summary
            class="link"
            style="font-size:13.5px"
          >
            Mudar o endereço
          </summary>
          <label
            class="field"
            style="margin-top:6px"
          ><span class="sr-only">Endereço</span><input
            v-model="form.slug"
            class="input"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            @input="slugEdited = true"
          ><span class="field__hint">Só letras minúsculas, números e hífen.</span></label>
        </details>
        <label class="field"><span class="field__label">Cidade</span><input
          v-model="form.city"
          class="input"
          placeholder="Ex.: Porto Alegre"
          maxlength="80"
        ></label>
        <p
          class="caps"
          style="margin-top:4px"
        >
          Quem coordena
        </p>
        <div
          style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px"
        >
          <label class="field"><span class="field__label">Nome</span><input
            v-model="form.coordName"
            class="input"
            autocomplete="off"
          ></label>
          <label class="field"><span class="field__label">Celular (WhatsApp)</span><input
            v-model="form.coordPhone"
            class="input"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            placeholder="(51) 99999-9999"
          ></label>
        </div>
        <button
          class="btn"
          :disabled="busy"
        >
          Criar igreja e gerar convite
        </button>
      </form>
    </div>
  </main>
</template>
