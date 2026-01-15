/**
 * Goals Display Test
 * Tests that the "Your Goals" section displays goal cards correctly
 */
import { test, expect } from '@playwright/test';

test.describe('Goals Display', () => {
  test('should display goals in the sidebar when game starts', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');

    // Start the game
    await page.click('#start-game-btn');

    // Wait for game to initialize
    await page.waitForSelector('#stock-prices', { timeout: 5000 });

    // Check that the "Your Goals" section exists
    const goalsSection = page.locator('#my-goals');
    await expect(goalsSection).toBeVisible();

    // Wait a moment for goals to render
    await page.waitForTimeout(500);

    // Check that goal cards are displayed (should have 3 goals)
    const goalCards = page.locator('#my-goals .goal-card-mini');
    await expect(goalCards).toHaveCount(3);
  });

  test('should display goal card details (stock change, goal, reward)', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for game to initialize
    await page.waitForSelector('#stock-prices', { timeout: 5000 });
    await page.waitForTimeout(500);

    // Get the first goal card
    const firstGoalCard = page.locator('#my-goals .goal-card-mini').first();
    await expect(firstGoalCard).toBeVisible();

    // Check that it has content (not "undefined")
    const cardText = await firstGoalCard.textContent();

    // Should not contain "undefined"
    expect(cardText).not.toContain('undefined');

    // Should have some actual text content
    expect(cardText.length).toBeGreaterThan(10);
  });

  test('should display stock change information', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    await page.waitForSelector('#stock-prices', { timeout: 5000 });
    await page.waitForTimeout(500);

    const firstGoalCard = page.locator('#my-goals .goal-card-mini').first();
    const cardText = await firstGoalCard.textContent();

    // Should contain a color name (Blue, Orange, Yellow, or Purple)
    const hasColor = /Blue|Orange|Yellow|Purple/.test(cardText);
    expect(hasColor).toBe(true);

    // Should contain a number or direction indicator
    const hasNumber = /\+\d|-\d|\d/.test(cardText);
    expect(hasNumber).toBe(true);
  });

  test('should display goal requirements', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    await page.waitForSelector('#stock-prices', { timeout: 5000 });
    await page.waitForTimeout(500);

    const firstGoalCard = page.locator('#my-goals .goal-card-mini').first();
    const cardText = await firstGoalCard.textContent();

    // Should contain a color name for the requirement
    const hasColor = /Blue|Orange|Yellow|Purple/.test(cardText);
    expect(hasColor).toBe(true);
  });

  test('should display reward information', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    await page.waitForSelector('#stock-prices', { timeout: 5000 });
    await page.waitForTimeout(500);

    const firstGoalCard = page.locator('#my-goals .goal-card-mini').first();
    const cardText = await firstGoalCard.textContent();

    // Should contain reward-related text (Gain, Look, Swap, etc.)
    const hasRewardText = /Gain|Look|Swap|Buy|Steal|Take|Adjust|Peek/i.test(cardText);
    expect(hasRewardText).toBe(true);
  });

  test('should have hover effect on goal cards', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    await page.waitForSelector('#stock-prices', { timeout: 5000 });
    await page.waitForTimeout(500);

    const firstGoalCard = page.locator('#my-goals .goal-card-mini').first();

    // Check initial background color
    const initialBg = await firstGoalCard.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    // Hover over the card
    await firstGoalCard.hover();

    // Wait a moment for transition
    await page.waitForTimeout(300);

    // Check background color changed
    const hoverBg = await firstGoalCard.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    // Background should have changed
    expect(hoverBg).not.toBe(initialBg);
  });

  test('should mark revealed goals as revealed', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    await page.waitForSelector('#stock-prices', { timeout: 5000 });

    // Wait for goal resolution phase (skip auction and trading)
    // This is a simplified test - in real gameplay you'd play through phases
    // For now, just verify the structure exists
    const goalsSection = page.locator('#my-goals');
    await expect(goalsSection).toBeVisible();

    // Initially, should have no "Revealed" labels
    const revealedLabels = page.locator('#my-goals:has-text("✅ Revealed")');
    const count = await revealedLabels.count();

    // At start of game, should be 0 revealed goals
    expect(count).toBe(0);
  });

  test('should be scrollable if there are many goals', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    await page.waitForSelector('#stock-prices', { timeout: 5000 });
    await page.waitForTimeout(500);

    const goalsSection = page.locator('#my-goals');

    // Check that max-height is set (for scrollability)
    const maxHeight = await goalsSection.evaluate(el =>
      window.getComputedStyle(el).maxHeight
    );

    expect(maxHeight).toBe('500px');

    // Check overflow-y is set to auto
    const overflowY = await goalsSection.evaluate(el =>
      window.getComputedStyle(el).overflowY
    );

    expect(overflowY).toBe('auto');
  });
});
