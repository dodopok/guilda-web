import { publicChurch } from '~~/server/services/churches'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { church: publicChurch(ctx.church), me: { personId: ctx.personId, roles: ctx.roles } }
})
