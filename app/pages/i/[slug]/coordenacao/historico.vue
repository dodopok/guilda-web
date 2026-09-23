<script setup lang="ts">
useHead({ title: 'Histórico' })
const route = useRoute()
const { capi, tz } = useChurch()
interface Entry { id: string, action: string, entityType: string, entityId: string | null, data: Record<string, unknown>, reason: string | null, createdAt: string, actorName: string | null }
const { data } = await useAsyncData(`audit-${route.params.slug}`, () => capi<{ entries: Entry[] }>('/audit?limit=150'))
const ACTIONS: Record<string, string> = {
  'person.created': 'cadastrou uma pessoa', 'person.updated': 'alterou o cadastro de uma pessoa', 'person.qualifications': 'alterou funções de uma pessoa',
  'consent.granted': 'registrou consentimento', 'consent.revoked': 'registrou revogação de consentimento',
  'invite.created': 'enviou convite', 'invite.accepted': 'aceitou o convite', 'password_reset.issued': 'enviou link de nova senha', 'password_reset.completed': 'redefiniu a senha',
  'service.created': 'cadastrou culto', 'service.updated': 'alterou culto', 'service.deleted': 'apagou culto', 'slot.created': 'adicionou posto',
  'assignment.created': 'escalou', 'assignment.removed': 'retirou da escala', 'assignment.reassigned': 'fez designação excepcional',
  'assignment.confirmed': 'confirmou tarefa', 'assignment.declined': 'recusou tarefa',
  'swap.proposed': 'pediu troca', 'swap.accepted': 'aceitou troca', 'swap.rejected': 'recusou troca',
  'schedule.published': 'publicou escala', 'availability.scheduled': 'agendou pedido de indisponibilidade', 'availability.submitted': 'respondeu indisponibilidade',
  'script.created': 'criou roteiro', 'script.updated': 'alterou roteiro', 'script.blocks_updated': 'editou blocos do roteiro', 'script.published': 'publicou roteiro',
  'script.estevao_applied': 'aplicou dados do Estêvão', 'script.music_set': 'escolheu músicas', 'script.music_notified': 'avisou o louvor',
  'template.created': 'criou modelo', 'template.updated': 'alterou modelo', 'whatsapp.channel_updated': 'alterou o canal do WhatsApp', 'whatsapp.coexistence': 'registrou coexistência',
  'message.requeued': 'reenviou mensagem', 'church.updated': 'alterou configurações', 'church.created': 'cadastrou a igreja', 'duty.created': 'criou função', 'duty.updated': 'alterou função', 'ministry.created': 'criou ministério',
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Comunicação
      </p>
      <h1>Histórico</h1>
      <p class="lede">
        Quem fez o quê e quando. Telefones e senhas nunca aparecem aqui.
      </p>
    </div>
    <ul class="lines lines--tight">
      <li
        v-for="e in data?.entries ?? []"
        :key="e.id"
      >
        <p><span class="muted small num">{{ dateTime(e.createdAt, tz) }}</span> — <strong>{{ e.actorName ?? 'Sistema' }}</strong> {{ ACTIONS[e.action] ?? e.action }}</p>
        <p
          v-if="e.reason"
          class="small ink-2"
        >
          Motivo: {{ e.reason }}
        </p>
      </li>
    </ul>
  </div>
</template>
