import { test, expect, type Page } from '@playwright/test';

// The Definition-of-Done golden path, driven entirely through the browser and real HTTP:
// a new user signs up, buys test-mode credits, generates a video via MockProvider, watches
// it in the library, downloads it, and — separately — a failed job refunds automatically.

async function magicLink(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`/api/dev/magic-link?email=${encodeURIComponent(email)}`);
    if (res.ok()) return (await res.json()).url;
    await page.waitForTimeout(250);
  }
  throw new Error(`no magic link recorded for ${email}`);
}

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.fill('#email', email);
  await page.click('text=Email me a magic link');
  // The magic link is recorded once the verification request completes (NextAuth may show
  // its default verify-request page or our /check-email — either is fine).
  await page.waitForLoadState('networkidle');
  await page.goto(await magicLink(page, email));
  await expect(page).toHaveURL(/\/account/);
}

async function balance(page: Page): Promise<number> {
  const res = await page.request.get('/api/credits/balance');
  return (await res.json()).balance;
}

async function firstJob(page: Page): Promise<{ status: string; id: string; video: unknown }> {
  const res = await page.request.get('/api/jobs');
  return (await res.json()).jobs[0];
}

test('new user: sign up → buy credits → generate → watch → download', async ({ page }) => {
  const email = `e2e-happy-${Date.now()}@example.com`;
  await signIn(page, email);
  expect(await balance(page)).toBe(0);

  // Buy the Creator pack (dev fake-checkout → real webhook handler → credit).
  await page.goto('/billing');
  await page.getByRole('button', { name: 'Buy Creator' }).click();
  await expect(page.getByText(/Purchase complete/)).toBeVisible();
  expect(await balance(page)).toBe(550);

  // Generate: live cost preview must match the server price (30 for 5s).
  await page.goto('/generate');
  await page.fill('#prompt', 'a calm ocean at golden hour, cinematic');
  await expect(page.getByRole('button', { name: /Generate for 30 credits/ })).toBeVisible();
  await page.getByRole('button', { name: /Generate for/ }).click();
  await expect(page).toHaveURL(/\/queue/);

  // Credits were reserved immediately.
  expect(await balance(page)).toBe(520);

  // Worker completes it.
  await expect
    .poll(async () => (await firstJob(page)).status, { timeout: 30_000 })
    .toBe('succeeded');

  // Library shows a playable, downloadable video.
  await page.goto('/library');
  const video = page.locator('video').first();
  await expect(video).toBeVisible();
  const src = await video.getAttribute('src');
  expect(src).toBeTruthy();
  const download = await page.request.get(src!);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toContain('video/mp4');
  const bytes = (await download.body()).byteLength;
  expect(bytes).toBeGreaterThan(1000);
});

test('a failed job refunds automatically', async ({ page }) => {
  const email = `e2e-fail-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.goto('/billing');
  await page.getByRole('button', { name: 'Buy Starter' }).click();
  await expect(page.getByText(/Purchase complete/)).toBeVisible();
  const before = await balance(page); // 100

  // Submit a job forced to fail; credits are reserved then refunded on failure.
  const res = await page.request.post('/api/jobs', {
    data: { prompt: 'this must fail [force-fail]', durationSec: 3, aspectRatio: '1:1', stylePreset: 'anime' },
  });
  expect(res.status()).toBe(201);
  const cost = (await res.json()).job.costCredits;
  expect(await balance(page)).toBe(before - cost); // reserved

  await expect.poll(async () => (await firstJob(page)).status, { timeout: 30_000 }).toBe('failed');

  // Fully refunded, and the user sees a safe error in the queue.
  expect(await balance(page)).toBe(before);
  await page.goto('/queue');
  await expect(page.getByText(/Your credits have been refunded/)).toBeVisible();
});
