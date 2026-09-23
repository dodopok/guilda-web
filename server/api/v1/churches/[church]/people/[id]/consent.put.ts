import { consentSchema, setConsent } from '~~/server/services/people'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, consentSchema)
  await setConsent(db(), ctx, param(event, 'id'), input)
  return { ok: true }
})
