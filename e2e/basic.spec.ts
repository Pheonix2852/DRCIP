import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@drcip.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('public surfaces', () => {
  test('homepage renders the hero', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('h1.hero-h1')).toBeVisible();
    await expect(page.locator('h1.hero-h1')).toContainText(/coordinate/i);
  });

  test('unknown route renders the 404 page', async ({ page }) => {
    await page.goto('/#/this-route-does-not-exist');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByText('Page not found')).toBeVisible();
  });

  test('privacy page renders', async ({ page }) => {
    await page.goto('/#/privacy');
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
  });

  test('terms page renders', async ({ page }) => {
    await page.goto('/#/terms');
    await expect(page.getByRole('heading', { name: /Terms/i })).toBeVisible();
  });
});

test.describe('authentication', () => {
  test('protected route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/#/admin');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('invalid credentials show an inline error', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid/i);
  });

  test('valid admin credentials land on the admin dashboard', async ({ page }) => {
    test.skip(!ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD not set');
    await page.goto('/#/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD as string);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/#\/admin/);
    await expect(page.getByRole('heading', { name: /Admin Dashboard/i })).toBeVisible();
  });
});
