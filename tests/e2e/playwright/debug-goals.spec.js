/**
 * Debug test to inspect goal card structure
 */
import { test, expect } from '@playwright/test';

test('debug goal card structure', async ({ page }) => {
  await page.goto('http://localhost:8000/web/');
  await page.click('#start-game-btn');
  await page.waitForSelector('#stock-prices', { timeout: 5000 });
  await page.waitForTimeout(1000);

  // Execute JavaScript in the browser to inspect goal cards
  const goalStructure = await page.evaluate(() => {
    const state = window.gameEngine?.getVisibleState(window.gameApp?.humanPlayerId);
    const myPlayer = state?.players?.find(p => p.id === window.gameApp?.humanPlayerId);

    if (!myPlayer) {
      return { error: 'No player found' };
    }

    const goalCards = myPlayer.goalCards || [];

    if (goalCards.length === 0) {
      return { error: 'No goal cards' };
    }

    const firstGoal = goalCards[0];

    return {
      goalCardCount: goalCards.length,
      firstGoalKeys: Object.keys(firstGoal),
      hasStockChange: !!firstGoal.stockChange,
      hasGoal: !!firstGoal.goal,
      hasReward: !!firstGoal.reward,
      stockChangeKeys: firstGoal.stockChange ? Object.keys(firstGoal.stockChange) : null,
      goalKeys: firstGoal.goal ? Object.keys(firstGoal.goal) : null,
      rewardKeys: firstGoal.reward ? Object.keys(firstGoal.reward) : null,
      stockChangeText: firstGoal.stockChange?.text,
      goalText: firstGoal.goal?.text,
      rewardText: firstGoal.reward?.text,
      fullGoalCard: JSON.parse(JSON.stringify(firstGoal))
    };
  });

  console.log('Goal card structure:', JSON.stringify(goalStructure, null, 2));

  // Log to Playwright report
  test.info().annotations.push({
    type: 'goal-structure',
    description: JSON.stringify(goalStructure, null, 2)
  });

  expect(goalStructure.error).toBeUndefined();
  expect(goalStructure.goalCardCount).toBeGreaterThan(0);
});
