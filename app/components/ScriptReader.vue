<script setup lang="ts">
import type { PublishedContent } from '~/types'

defineProps<{ content: PublishedContent, tz: string }>()
</script>

<template>
  <article class="script">
    <section
      v-for="b in content.blocks"
      :key="b.id"
      class="script__block"
    >
      <h2>{{ b.title }}</h2>
      <p
        v-if="b.responsibles.length"
        class="script__who"
      >
        <template
          v-for="(r, i) in b.responsibles"
          :key="i"
        >
          {{ r.name }}<span
            v-if="r.status !== 'confirmed'"
            class="muted"
          > ({{ ASSIGNMENT_STATUS[r.status]?.label.toLowerCase() ?? r.status }})</span><template v-if="i < b.responsibles.length - 1">
            ,
          </template>
        </template>
      </p>
      <p
        v-if="b.reference"
        class="script__ref"
      >
        {{ b.reference }}
      </p>
      <ol
        v-if="b.songs.length"
        class="script__songs"
      >
        <li
          v-for="(s, i) in b.songs"
          :key="i"
        >
          <a
            v-if="s.link"
            :href="s.link"
            target="_blank"
            rel="noopener noreferrer"
          >{{ s.title }}</a><template v-else>
            {{ s.title }}
          </template>
          <span
            class="muted"
            style="font-family:var(--sans);font-size:.92rem"
          >{{ [s.author, s.musicalKey && `tom ${s.musicalKey}`].filter(Boolean).join(' · ') ? ` — ${[s.author, s.musicalKey && `tom ${s.musicalKey}`].filter(Boolean).join(' · ')}` : '' }}</span>
        </li>
      </ol>
      <ul
        v-if="b.items.length"
        class="script__songs"
      >
        <li
          v-for="(it, i) in b.items"
          :key="i"
        >
          {{ it.text }}<span
            v-if="it.owner"
            class="muted"
            style="font-family:var(--sans);font-size:.92rem"
          > — {{ it.owner }}</span>
        </li>
      </ul>
      <p
        v-if="b.body"
        class="script__text"
      >
        {{ b.body }}
      </p>
    </section>
  </article>
</template>
