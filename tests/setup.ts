// Fills the game data cache from a saved copy of TowerHub's responses, the way the bot fills it at
// startup, so the tests run offline and always see the same game.
import { vi } from 'vitest';

import { refreshGameData } from '../src/gameData.js';
import { stubTowerHub, towerHubResponses } from './helpers.js';

stubTowerHub(towerHubResponses());
vi.spyOn(console, 'log').mockImplementationOnce(() => undefined);
await refreshGameData();
vi.unstubAllGlobals();
