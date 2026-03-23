/**
 * Smoke test - verify the web app loads without errors
 */
import { test, expect } from '@playwright/test';

test.describe('Web App Smoke Test', () => {
  test('should load the app without errors', async ({ page }) => {
    // Listen for console errors (ignore favicon 404)
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(msg.text());
      }
    });

    // Listen for page errors
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Navigate to the app
    await page.goto('http://localhost:8000/web/');

    // Wait for the app to initialize
    await page.waitForSelector('#app', { timeout: 5000 });

    // Check that the start button is visible
    const startBtn = page.locator('#start-game-btn');
    await expect(startBtn).toBeVisible();

    // Verify no JavaScript errors (excluding harmless favicon 404)
    if (errors.length > 0) {
      console.log('JavaScript errors detected:', errors);
    }
    expect(errors.length).toBe(0);
  });

  test('should start a game when button is clicked', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');

    // Click start game button
    await page.click('#start-game-btn');

    // Wait for game to initialize (should see stock prices)
    await page.waitForSelector('#stock-prices', { timeout: 5000 });

    // Verify stock prices are displayed
    const stockPrices = page.locator('.stock-price-item');
    await expect(stockPrices).toHaveCount(4); // 4 colors

    // Verify players are displayed
    const players = page.locator('.player-card');
    await expect(players).toHaveCount(3); // 3 players

    // Verify game status is updated
    const phase = page.locator('#phase');
    await expect(phase).not.toHaveText('Not Started');
  });
});
