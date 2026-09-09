import { expect, test } from '@playwright/test'

import { AUTH_STATE_PATH, authStateExists } from '../scripts/qa-support'

const resultsUrl = '/recibos?estado=PAGADO&page=1&pageSize=25'

test.describe('Recibos responsive results and send center', () => {
  test.beforeEach(() => {
    if (!authStateExists()) throw new Error('Missing .auth/supabase-user.json. Run npm run qa:auth before this suite.')
  })

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    test(`uses receipt cards and a mobile-safe send center at ${viewport.width}px`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ storageState: AUTH_STATE_PATH, viewport })
      const page = await context.newPage()
      await page.goto(resultsUrl)

      const cards = page.getByTestId('receipt-card-results')
      await expect(cards).toBeVisible()
      await expect(page.getByTestId('receipt-table-results')).toBeHidden()
      await expect(page.getByText(/recibos encontrados/)).toBeVisible({ timeout: 30_000 })
      await expect(cards.locator('article').first()).toBeVisible({ timeout: 30_000 })

      const firstCard = cards.locator('article').first()
      await firstCard.locator('input[type="checkbox"]').check()
      await expect(page.getByText('1 seleccionados', { exact: true })).toBeVisible()
      await firstCard.getByText('Ver detalles', { exact: true }).click()
      await expect(firstCard.getByText('Tribunal', { exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`results-${viewport.width}px.png`), fullPage: true })

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

      await page.getByRole('button', { name: 'Enviar listado', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Enviar listado de recibos' })
      await expect(dialog).toBeVisible({ timeout: 30_000 })
      const advanced = dialog.getByRole('button', { name: 'Opciones avanzadas' })
      await expect(advanced).toHaveAttribute('aria-expanded', 'false')
      await expect(dialog.getByText('Plantilla de correo', { exact: true })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Confirmar envío' })).toBeVisible()
      await advanced.click()
      await expect(advanced).toHaveAttribute('aria-expanded', 'true')
      await expect(dialog.getByText('Plantilla de correo', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Actualizar vista previa' })).toBeVisible()

      const dialogBox = await dialog.boundingBox()
      expect(dialogBox).not.toBeNull()
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`send-center-${viewport.width}px.png`), fullPage: false })

      await dialog.getByRole('button', { name: 'Cerrar centro de envío' }).click()
      await page.getByRole('button', { name: 'Enviar listado', exact: true }).click()
      const reopenedDialog = page.getByRole('dialog', { name: 'Enviar listado de recibos' })
      await expect(reopenedDialog.getByRole('button', { name: 'Opciones avanzadas' })).toHaveAttribute('aria-expanded', 'false')
      await expect(reopenedDialog.getByRole('button', { name: 'Cerrar centro de envío' })).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(reopenedDialog.getByRole('button', { name: 'Confirmar envío' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(reopenedDialog).toBeHidden()

      await context.close()
    })
  }

  for (const viewport of [{ width: 1024, height: 768 }, { width: 1366, height: 768 }]) {
    test(`preserves the desktop receipt table at ${viewport.width}px`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ storageState: AUTH_STATE_PATH, viewport })
      const page = await context.newPage()
      await page.goto(resultsUrl)

      await expect(page.getByTestId('receipt-table-results')).toBeVisible()
      await expect(page.getByTestId('receipt-card-results')).toBeHidden()
      await expect(page.getByRole('columnheader', { name: 'Carátula' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Gestión' })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`desktop-table-${viewport.width}px.png`), fullPage: false })

      await context.close()
    })
  }
})
