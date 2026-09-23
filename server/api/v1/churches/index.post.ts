import { createChurch, createChurchSchema, publicChurch } from '~~/server/services/churches'

export default defineApiHandler(async (event) => {
  const input = await body(event, createChurchSchema)
  const result = await createChurch(db(), actorOf(event), input)
  setResponseStatus(event, 201)
  return { church: publicChurch(result.church), coordinatorPersonId: result.coordinatorPersonId, inviteLink: result.inviteLink }
})
