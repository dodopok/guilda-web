<script setup lang="ts">
useHead({ title: 'Cadastrar igreja · Guilda' })
const { me } = useSession()
if (!me.value?.account.isPlatformAdmin) await navigateTo('/')
const toast = useToast()
const form = reactive({ name: '', slug: '', timezone: 'America/Sao_Paulo', defaultLocation: '', coordName: '', coordPhone: '' })
watch(() => form.name, (n) => {
  form.slug = n.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
})
const created = ref<{ slug: string, inviteLink: string | null } | null>(null)
async function submit() {
  try {
    const r = await api<{ church: { slug: string }, inviteLink: string | null }>('/churches', { method: 'POST', body: { name: form.name, slug: form.slug, timezone: form.timezone, defaultLocation: form.defaultLocation || undefined, coordinator: { displayName: form.coordName, phone: form.coordPhone } } })
    created.value = { slug: r.church.slug, inviteLink: r.inviteLink }
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <div class="door__box">
      <BrandMark class="door__mark" />
      <h1>Nova igreja</h1>
      <p class="lede">
        Cada igreja tem dados, mensagens e configurações separados. A primeira pessoa da coordenação recebe o convite depois que o canal de WhatsApp da igreja estiver configurado.
      </p>
      <div
        v-if="created"
        class="notice notice--ok"
        style="margin-top:1.5rem"
      >
        <p>Igreja criada em <code>/i/{{ created.slug }}</code>.</p>
        <template v-if="created.inviteLink">
          <p style="margin-top:.5rem">
            Entregue este convite <strong>somente à pessoa da coordenação</strong>. Ele vale 72 horas, é de uso único e não será mostrado de novo:
          </p>
          <p style="margin-top:.5rem;word-break:break-all">
            <code>{{ created.inviteLink }}</code>
          </p>
        </template>
        <p
          v-else
          style="margin-top:.5rem"
        >
          Você já faz parte da coordenação desta igreja.
        </p>
      </div>
      <form
        v-else
        @submit.prevent="submit"
      >
        <label class="field"><span class="field__label">Nome</span><input
          v-model="form.name"
          class="input"
          required
        ></label>
        <label class="field"><span class="field__label">Endereço curto</span><input
          v-model="form.slug"
          class="input"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        ><span class="field__hint">/i/{{ form.slug || '...' }}</span></label>
        <label class="field"><span class="field__label">Fuso horário</span><input
          v-model="form.timezone"
          class="input"
          required
        ></label>
        <label class="field"><span class="field__label">Local padrão</span><input
          v-model="form.defaultLocation"
          class="input"
        ></label>
        <label class="field"><span class="field__label">Coordenação: nome</span><input
          v-model="form.coordName"
          class="input"
          required
        ></label>
        <label class="field"><span class="field__label">Coordenação: celular</span><input
          v-model="form.coordPhone"
          class="input"
          inputmode="tel"
          required
        ></label>
        <button
          class="btn btn--primary btn--block"
          style="margin-top:1.5rem"
        >
          Cadastrar igreja
        </button>
      </form>
      <p style="margin-top:1.5rem">
        <NuxtLink to="/">Voltar</NuxtLink>
      </p>
    </div>
  </main>
</template>
