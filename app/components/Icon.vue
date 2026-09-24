<script setup lang="ts">
// Conjunto pequeno de ícones desenhados no mesmo traço (1.8), sem biblioteca externa.
const props = withDefaults(defineProps<{ name: string, label?: string, weight?: number | string }>(), { weight: 1.8 })
const paths: Record<string, string> = {
  'check': 'M4.5 12.5l4.5 4.5L19.5 6.5',
  'x': 'M6 6l12 12M18 6L6 18',
  'circle': 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z',
  'clock': 'M12 3.75a8.25 8.25 0 1 0 0 16.5a8.25 8.25 0 1 0 0-16.5zM12 7.5V12l3 2',
  'pin': 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.25a2.25 2.25 0 1 0 0-4.5a2.25 2.25 0 0 0 0 4.5z',
  'home': 'M4 11l8-6.5 8 6.5M6 9.5V19.5h4.5V14h3v5.5H18V9.5',
  'calendar': 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  'book': 'M5 5.5c2.5-1 5-1 7 .5c2-1.5 4.5-1.5 7-.5v13c-2.5-1-5-1-7 .5c-2-1.5-4.5-1.5-7-.5zM12 6v13',
  'user': 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5',
  'swap': 'M7 7.5h11l-3-3M17 16.5H6l3 3',
  'alert': 'M12 4l9 16H3zM12 10v4.5M12 17.2v.1',
  'info': 'M12 3.75a8.25 8.25 0 1 0 0 16.5a8.25 8.25 0 1 0 0-16.5zM12 11v5M12 8v.1',
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  'trash': 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  'up': 'M12 18V6M6.5 11.5L12 6l5.5 5.5',
  'down': 'M12 6v12M6.5 12.5L12 18l5.5-5.5',
  'arrow-right': 'M5 12h14M13.5 6.5L19 12l-5.5 5.5',
  'arrow-left': 'M19 12H5M10.5 6.5L5 12l5.5 5.5',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'print': 'M7 9V4h10v5M7 17H4.5v-7h15v7H17M7 14h10v6H7z',
  'download': 'M12 4v11M7 10.5L12 15.5l5-5M5 19.5h14',
  'send': 'M4 12l16-7-6 15-3-6.5z',
  'music': 'M9 18.5V6.5l10-2v12M9 18.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0zM19 16.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0z',
  'bell': 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4',
  'logout': 'M14 5H5.5v14H14M10 12h10M16.5 8.5L20 12l-3.5 3.5',
  'settings': 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  'external': 'M13 5h6v6M19 5l-8 8M17 14v5H5V7h5',
  'edit': 'M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5zM13.5 7l3.5 3.5',
  'people': 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 19.5c.6-3.2 3.1-5 6.5-5s5.9 1.8 6.5 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .6 3.2 2.2 3.5 4.7',
  'message': 'M4.5 5.5h15v10h-9L6 19.5v-4H4.5z',
  'sparkle': 'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8',
  'upload': 'M12 15V4M7 8.5L12 3.5l5 5M5 19.5h14',
  'chevron-up': 'M18 14.5l-6-6-6 6',
  'grip': 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  'chevron-left': 'M14.5 6l-6 6 6 6',
}
const d = computed(() => paths[props.name] ?? paths.circle)
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="weight"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <path :d="d" />
  </svg>
</template>
