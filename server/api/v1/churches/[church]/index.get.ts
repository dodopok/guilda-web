import { publicChurch } from '~~/server/services/churches'
import { isCoordinator } from '~~/server/services/context'
import { getChannel } from '~~/server/services/messaging/outbox'
import { currentLiturgicalColor } from '~~/server/services/overview'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const channel = isCoordinator(ctx) ? await getChannel(db(), ctx.church.id) : null
  return {
    church: publicChurch(ctx.church),
    me: { personId: ctx.personId, roles: ctx.roles },
    liturgicalColor: await currentLiturgicalColor(db(), ctx.church.id),
    // Só a coordenação precisa saber o modo do canal (faixa de simulação).
    whatsappMode: channel?.mode ?? null,
  }
})
