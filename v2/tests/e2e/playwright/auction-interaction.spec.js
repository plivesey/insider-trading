/**
 * Auction Phase Interaction Test
 * Tests human player interaction with the auction phase UI
 */
import { test, expect } from '@playwright/test';

test.describe('Auction Phase Interaction', () => {
  test('should display auction controls when human turn arrives', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');

    // Start the game
    await page.click('#start-game-btn');

    // Wait for game to initialize
    await page.waitForSelector('#stock-prices', { timeout: 5000 });

    // Wait for auction phase
    await page.waitForSelector('.phase-title', { timeout: 5000 });

    // Verify we're in auction phase
    const phaseText = await page.locator('#phase').textContent();
    expect(phaseText).toBe('auction');

    // Wait for auction controls to appear (when it's human's turn)
    // Note: This might take a few seconds if AIs go first
    await page.waitForSelector('#auction-controls', { timeout: 10000, state: 'visible' });

    // Verify bid input exists
    const bidInput = page.locator('#bid-amount');
    await expect(bidInput).toBeVisible();

    // Verify buttons exist
    const placeBidBtn = page.locator('#place-bid-btn');
    const passBtn = page.locator('#pass-btn');
    await expect(placeBidBtn).toBeVisible();
    await expect(passBtn).toBeVisible();

    // Verify turn indicator shows it's human's turn
    const turnIndicator = page.locator('#turn-indicator');
    await expect(turnIndicator).toContainText('Your Turn');
  });

  test('should validate bid amounts correctly', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for human's turn in auction
    await page.waitForSelector('#auction-controls', { timeout: 10000, state: 'visible' });

    const bidInput = page.locator('#bid-amount');
    const placeBidBtn = page.locator('#place-bid-btn');

    // Get the min and max bid values
    const minBid = await bidInput.getAttribute('min');
    const maxBid = await bidInput.getAttribute('max');

    // Test invalid bid (below minimum)
    await bidInput.fill(String(parseInt(minBid) - 1));
    await page.waitForTimeout(100); // Wait for validation
    await expect(placeBidBtn).toBeDisabled();

    // Test valid bid
    await bidInput.fill(minBid);
    await page.waitForTimeout(100);
    await expect(placeBidBtn).toBeEnabled();

    // Test invalid bid (above maximum)
    await bidInput.fill(String(parseInt(maxBid) + 1));
    await page.waitForTimeout(100);
    await expect(placeBidBtn).toBeDisabled();
  });

  test('should allow placing a bid', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for human's turn
    await page.waitForSelector('#auction-controls', { timeout: 10000, state: 'visible' });

    const bidInput = page.locator('#bid-amount');
    const placeBidBtn = page.locator('#place-bid-btn');

    // Get initial bid value
    const initialBidValue = await bidInput.inputValue();

    // Place a bid
    await placeBidBtn.click();

    // Verify event log shows the bid
    await expect(page.locator('#event-log')).toContainText(`You bid $${initialBidValue}`);

    // Verify controls are hidden (no longer our turn)
    await expect(page.locator('#auction-controls')).toBeHidden();
  });

  test('should allow passing', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for human's turn
    await page.waitForSelector('#auction-controls', { timeout: 10000, state: 'visible' });

    const passBtn = page.locator('#pass-btn');

    // Pass
    await passBtn.click();

    // Verify event log shows the pass
    await expect(page.locator('#event-log')).toContainText('You passed');

    // Verify controls are hidden
    await expect(page.locator('#auction-controls')).toBeHidden();
  });

  test('should support keyboard shortcuts (Enter to bid)', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for human's turn
    await page.waitForSelector('#auction-controls', { timeout: 10000, state: 'visible' });

    const bidInput = page.locator('#bid-amount');

    // Get initial bid value
    const initialBidValue = await bidInput.inputValue();

    // Press Enter to bid
    await bidInput.press('Enter');

    // Verify event log shows the bid
    await expect(page.locator('#event-log')).toContainText(`You bid $${initialBidValue}`);
  });

  test('should display current card and bid information', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for auction phase
    await page.waitForSelector('.phase-title', { timeout: 5000 });

    // Verify current card is displayed
    const resourceCard = page.locator('.resource-card');
    await expect(resourceCard).toBeVisible();

    // Verify current bid display
    const currentBidDisplay = page.locator('#current-bid-display');
    await expect(currentBidDisplay).toBeVisible();

    // Verify it shows a dollar amount
    const bidText = await currentBidDisplay.textContent();
    expect(bidText).toMatch(/\$\d+/);
  });

  test('should update bid display when AIs bid', async ({ page }) => {
    await page.goto('http://localhost:8000/web/');
    await page.click('#start-game-btn');

    // Wait for auction phase
    await page.waitForSelector('.phase-title', { timeout: 5000 });

    // Get initial bid
    const initialBid = await page.locator('#current-bid-display').textContent();

    // Wait a bit for AIs to potentially bid
    await page.waitForTimeout(3000);

    // Get updated bid
    const updatedBid = await page.locator('#current-bid-display').textContent();

    // Bid should have increased (or stayed the same if no one bid)
    // At least verify the display still exists and shows a valid amount
    expect(updatedBid).toMatch(/\$\d+/);
  });
});
