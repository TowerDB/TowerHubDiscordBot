import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '../src/config.js';
import { fetchJson, TowerHubBusyError } from '../src/utils/towerhub.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calls to TowerHub', () => {
  it('say they are the bot', async () => {
    const stub = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', stub);

    await fetchJson('/api/mechanics');

    const [, init] = stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'User-Agent': expect.stringContaining('TowerHubDiscordBot') });
  });

  it('carry the bot key', async () => {
    const stub = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', stub);

    await fetchJson('/api/mechanics');

    const [, init] = stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-Bot-Key': config.towerHubBotKey });
  });

  it('read a 429 as busy, not as an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));

    await expect(fetchJson('/api/mechanics')).rejects.toBeInstanceOf(TowerHubBusyError);
  });
});
