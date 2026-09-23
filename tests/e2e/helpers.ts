import { type Page, expect } from '@playwright/test'

export const PHONES = {
  coord: '+5551900000001',
  pastor: '+5551900000002',
  alice: '+5551900000004',
  bento: '+5551900000005',
  clara: '+5551900000006',
}
export const PASSWORD = 'guilda-demo-123'

export async function login(page: Page, phone: string, password = PASSWORD) {
  await page.goto('/entrar')
  await page.getByLabel('Seu celular').fill(phone)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/entrar/)
}

function localMonth(offset: number) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const idx = y * 12 + (m - 1) + offset
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}
export const nextMonth = () => localMonth(1)

export interface EditorData {
  services: { id: string, startsAt: string, title: string, kind: string, slots: { id: string, dutyId: string, assignments: { id: string, personName: string }[] }[] }[]
  duties: { id: string, name: string }[]
}

export async function editor(page: Page, month: string): Promise<EditorData> {
  const res = await page.request.get(`/api/v1/churches/porto/schedule/${month}`)
  expect(res.ok()).toBeTruthy()
  return res.json()
}
