import { expect, test } from '@playwright/test'

test('logging in with an existing account', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'admin1234')
  await page.check('input[name="remember"]')
  await page.click('[data-test=submit-button]')

  const channelName = await page.innerText('[data-test=left-nav] a[href="/chat/ShieldBattery"]')
  expect(channelName).toBe('#ShieldBattery')
})