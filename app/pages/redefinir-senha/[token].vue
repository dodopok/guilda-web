<script setup lang="ts">
useHead({ title: 'Nova senha · Guilda', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const { load } = useSession()
const MIN = 10
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)
const brand = ref<RememberedBrand | null>(null)
onMounted(() => {
  brand.value = readRememberedBrand()
})
useHead(() => ({ htmlAttrs: { style: accentStyle(brand.value?.accent) } }))

// Força: tamanho mínimo, maiúscula, número e símbolo (ou frase longa).
const score = computed(() => {
  const p = password.value
  return (p.length >= MIN ? 1 : 0) + (/[A-ZÀ-Ý]/.test(p) ? 1 : 0) + (/\d/.test(p) ? 1 : 0) + (/[^\p{L}\d]/u.test(p) || p.length >= 16 ? 1 : 0)
})
const bars = computed(() => [1, 2, 3, 4].map((n) => (n <= score.value ? (score.value <= 1 ? 'var(--no)' : score.value === 2 ? '#e0a100' : 'var(--ok)') : 'var(--line)')))
const hint = computed(() => {
  const p = password.value
  if (!p) return 'Digite para ver a força.'
  if (p.length < MIN) return `Ainda curta: ${MIN - p.length === 1 ? 'falta 1 caractere' : `faltam ${MIN - p.length} caracteres`}.`
  return score.value <= 2 ? 'Boa. Uma frase com números fica mais forte.' : 'Ótima senha.'
})
const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== password.value)

async function submit() {
  error.value = ''
  if (password.value.length < MIN) {
    error.value = `Use pelo menos ${MIN} caracteres.`
    return
  }
  if (password.value !== confirm.value) {
    error.value = 'As senhas não são iguais.'
    return
  }
  busy.value = true
  try {
    await api('/password-reset/confirm', { method: 'POST', body: { token: String(route.params.token), password: password.value } })
    await load(true)
    await navigateTo('/')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <form
      class="door__card stack-md"
      style="max-width:440px;gap:14px"
      novalidate
      @submit.prevent="submit"
    >
      <DoorHead
        :name="brand?.name"
        :logo="brand?.logo"
      />
      <h1 style="font-size:26px;line-height:1.15">
        Crie uma nova senha
      </h1>
      <p class="soft">
        Pelo menos {{ MIN }} caracteres. Pode ser uma frase fácil de lembrar.
      </p>
      <PasswordField
        v-model="password"
        label="Nova senha"
        autocomplete="new-password"
      />
      <div aria-live="polite">
        <div
          class="row"
          style="gap:4px;flex-wrap:nowrap"
          aria-hidden="true"
        >
          <span
            v-for="(c, i) in bars"
            :key="i"
            style="flex:1;height:6px;border-radius:999px"
            :style="{ background: c }"
          />
        </div>
        <p
          class="soft"
          style="margin-top:6px;font-size:13.5px"
        >
          {{ hint }}
        </p>
      </div>
      <PasswordField
        v-model="confirm"
        label="Repita a senha"
        autocomplete="new-password"
      />
      <p
        v-if="mismatch"
        style="margin-top:-6px;font-size:13.5px;color:var(--no);font-weight:700"
      >
        As senhas não são iguais.
      </p>
      <p
        v-if="error"
        class="form-error"
        role="alert"
      >
        {{ error }}
      </p>
      <button
        class="btn"
        :disabled="busy"
      >
        Salvar e entrar
      </button>
      <p
        class="small muted"
        style="text-align:center"
      >
        Por segurança, quem estiver conectado em outros aparelhos vai precisar entrar de novo.
      </p>
    </form>
  </main>
</template>
