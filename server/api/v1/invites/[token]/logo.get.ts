import { getLogo } from '~~/server/services/brand'
import { inviteChurchId } from '~~/server/services/auth'
import { notFound } from '~~/server/lib/errors'

// Logo da igreja na tela do convite (antes de a pessoa ter conta).
export default defineApiHandler(async (event) => {
  rateLimit(event, 'invite-view', 60, 60_000)
  const churchId = await inviteChurchId(db(), param(event, 'token'))
  const logo = await getLogo(db(), churchId)
  if (!logo) throw notFound('Logo')
  sendLogo(event, logo)
  return logo.bytes
})
