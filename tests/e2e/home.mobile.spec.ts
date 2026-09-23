import { expect, test } from '@playwright/test'
import { PHONES, login } from './helpers'

test('celular: navegação inferior, próxima escala e acessibilidade básica', async ({ page }) => {
  await login(page, PHONES.alice)
  await expect(page.getByRole('navigation', { name: 'Principal' }).last()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Início' }).last()).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bom dia|Boa tarde|Boa noite/)
  // Todo botão visível tem nome acessível.
  const unnamed = await page.locator('button:visible').evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim())).length)
  expect(unnamed).toBe(0)
  await page.screenshot({ path: 'test-results/inicio-celular.png', fullPage: true })
})
