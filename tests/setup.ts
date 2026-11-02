// Fills the game data cache from a saved copy of TowerHub's responses, the way the bot fills it at
// startup, so the tests run offline and always see the same game.
import { afterEach, vi } from 'vitest';

import { clearContentCache } from '../src/content.js';
import { refreshGameData } from '../src/gameData.js';
import { stubTowerHub, towerHubResponses } from './helpers.js';

stubTowerHub(towerHubResponses());
vi.spyOn(console, 'log').mockImplementationOnce(() => undefined);
await refreshGameData();
vi.unstubAllGlobals();

// Each test starts with nothing held from the last.
afterEach(() => {
  clearContentCache();
});
