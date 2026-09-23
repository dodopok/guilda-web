<script setup lang="ts">
// Cabeçalho das telas de acesso: logo e nome da igreja ou, sem igreja, a marca da Guilda.
defineProps<{ name?: string | null, logo?: string | null, size?: number }>()
</script>

<template>
  <div
    class="row"
    style="flex-wrap:nowrap;gap:12px"
  >
    <ChurchMark
      v-if="name"
      :name="name"
      :src="logo"
      :size="size ?? 52"
      :radius="16"
    />
    <span
      v-else
      class="cmark"
      :style="{ width: `${size ?? 52}px`, height: `${size ?? 52}px`, borderRadius: '16px' }"
    ><GuildaMark style="width:60%;height:60%" /></span>
    <div class="grow">
      <p
        class="strong"
        style="font-size:17px"
      >
        {{ name ?? 'Guilda' }}
      </p>
      <p
        class="muted"
        style="font-size:13.5px"
      >
        {{ name ? 'na Guilda' : 'escalas e roteiros de culto' }}
      </p>
    </div>
    <slot />
  </div>
</template>
