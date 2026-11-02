import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubTowerHub, towerHubResponses } from './helpers.js';

const MINUTE = 60_000;
const CALLS_PER_REFRESH = 2;

/** A cache that has loaded nothing yet, as each test needs its own. */
async function freshCache() {
  vi.resetModules();

  return import('../src/gameData.js');
}

/** Lets a refresh that nothing awaits finish. Not vi.waitFor, which moves the fake clock each time it polls. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function renamedFirstEternal(name: string): string {
  const game = JSON.parse(towerHubResponses()['/api/system/gamedata'] as string);
  game.eternals[0].name = name;

  return JSON.stringify(game);
}

describe('game data cache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws until something has loaded', async () => {
    stubTowerHub(towerHubResponses());
    const { gameData } = await freshCache();

    expect(() => gameData()).toThrow('has not loaded');
    await settle();
  });

  it('loads after that first failed read, so a bot that started during an outage recovers', async () => {
    stubTowerHub(towerHubResponses());
    const { gameData } = await freshCache();

    expect(() => gameData()).toThrow();
    await settle();

    expect(gameData().eternals.length).toBeGreaterThan(0);
  });

  it('does not ask again within 30 minutes', async () => {
    const fetched = stubTowerHub(towerHubResponses());
    const { gameData, refreshGameData } = await freshCache();
    await refreshGameData();

    vi.advanceTimersByTime(30 * MINUTE - 1);
    gameData();
    await settle();

    expect(fetched).toHaveBeenCalledTimes(CALLS_PER_REFRESH);
  });

  it('answers with what it has once expired, then has the new data for the next read', async () => {
    stubTowerHub(towerHubResponses());
    const { gameData, refreshGameData } = await freshCache();
    await refreshGameData();
    const before = gameData().eternals[0]?.name;

    stubTowerHub({ ...towerHubResponses(), '/api/system/gamedata': renamedFirstEternal('Renamed') });
    vi.advanceTimersByTime(30 * MINUTE);

    expect(gameData().eternals[0]?.name).toBe(before);
    await settle();
    expect(gameData().eternals[0]?.name).toBe('Renamed');
  });

  it('shares one refresh between everyone reading while it runs', async () => {
    const fetched = stubTowerHub(towerHubResponses());
    const { gameData, refreshGameData } = await freshCache();
    await refreshGameData();
    fetched.mockClear();

    vi.advanceTimersByTime(30 * MINUTE);
    gameData();
    gameData();
    gameData();
    await settle();

    expect(fetched).toHaveBeenCalledTimes(CALLS_PER_REFRESH);
  });

  it.each([
    ['an error status', { '/api/system/gamedata': undefined }],
    ['a body that is not JSON', { '/api/mechanics': '<html>' }],
    ['no eternals', { '/api/system/gamedata': JSON.stringify({ eternals: [], items: [] }) }],
    ['a body of the wrong shape', { '/api/mechanics': '{}' }],
  ])('keeps what it has through %s, and waits a minute before trying again', async (_, broken) => {
    stubTowerHub(towerHubResponses());
    const { gameData, refreshGameData } = await freshCache();
    await refreshGameData();
    const before = gameData();

    const responses = Object.fromEntries(
      Object.entries({ ...towerHubResponses(), ...broken }).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    const fetched = stubTowerHub(responses);
    vi.advanceTimersByTime(30 * MINUTE);
    gameData();
    await settle();

    expect(gameData()).toBe(before);
    await settle();
    expect(console.error).toHaveBeenCalledOnce();

    fetched.mockClear();
    vi.advanceTimersByTime(MINUTE - 1);
    gameData();
    await settle();
    expect(fetched).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    gameData();
    await settle();
    expect(fetched).toHaveBeenCalled();
  });

  it('logs the status of an error answer, rather than a failure to parse its body', async () => {
    stubTowerHub({});
    const { refreshGameData } = await freshCache();
    await refreshGameData();

    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: expect.stringContaining('answered 404') }));
  });

  it('keeps a failed network request from rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const { refreshGameData } = await freshCache();

    await expect(refreshGameData()).resolves.toBeUndefined();
  });

  it('links each item to its eternal, leaving Echo items without one', async () => {
    stubTowerHub(towerHubResponses());
    const { gameData, refreshGameData } = await freshCache();
    await refreshGameData();

    for (const { item, eternal } of gameData().items) {
      expect(eternal?.slug ?? null).toBe(item.eternalSlug);
    }
  });
});
