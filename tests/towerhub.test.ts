import { afterEach, describe, expect, it, vi } from 'vitest';

import { getConfig } from '../src/config.js';
import {
  buildsUrl,
  buildUrl,
  eternalsUrl,
  eternalUrl,
  fetchJson,
  filtered,
  findJson,
  guidesUrl,
  guideUrl,
  itemsUrl,
  itemUrl,
  TowerHubBusyError,
} from '../src/utils/towerhub.js';
import { buildSummary, guide } from './helpers.js';

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
    expect(init.headers).toMatchObject({ 'X-Bot-Key': getConfig().towerHubBotKey });
  });

  it('read a 429 as busy, not as an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));

    await expect(fetchJson('/api/mechanics')).rejects.toBeInstanceOf(TowerHubBusyError);
  });
});

describe('addresses', () => {
  const site = new URL(getConfig().towerHubUrl).origin;

  it('point at a page by slug', () => {
    expect(eternalsUrl()).toBe(`${site}/eternals`);
    expect(eternalUrl({ slug: 'dahla' } as never)).toBe(`${site}/eternals/dahla`);
    expect(itemUrl({ slug: 'vanish-crown' } as never)).toBe(`${site}/items/vanish-crown`);
    expect(guideUrl(guide())).toBe(`${site}/guides/dahla-basics`);
    expect(buildUrl(buildSummary())).toBe(`${site}/builds/bleed-dahla`);
  });

  it('carry only the filters that have a value', () => {
    expect(filtered('/guides', { category: 'Community', author: '', search: null, sort: undefined })).toBe(`${site}/guides?category=Community`);
  });

  it('have no query when nothing is filtered', () => {
    expect(guidesUrl({})).toBe(`${site}/guides`);
    expect(buildsUrl({ author: null })).toBe(`${site}/builds`);
    expect(itemsUrl()).toBe(`${site}/items`);
  });

  it('encode what people typed', () => {
    const address = new URL(buildsUrl({ search: 'a&b=c d', author: 'Ra vah' }));

    expect(address.searchParams.get('search')).toBe('a&b=c d');
    expect(address.searchParams.get('author')).toBe('Ra vah');
    expect(address.search).not.toContain(' ');
  });

  it('open the items page by eternal and slot', () => {
    expect(itemsUrl({ eternal: 'dahla', slot: 'Weapon' })).toBe(`${site}/items?eternal=dahla&slot=Weapon`);
  });
});

describe('findJson', () => {
  it('asks for the path on the TowerHub address', async () => {
    const stub = vi.fn(async () => new Response('{"a":1}'));
    vi.stubGlobal('fetch', stub);

    expect(await findJson('/api/mechanics?x=1')).toEqual({ a: 1 });
    expect((stub.mock.calls[0] as unknown as [string])[0]).toBe(new URL('/api/mechanics?x=1', getConfig().towerHubUrl).href);
  });

  it('answers undefined for a 404, but fetchJson throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));

    expect(await findJson('/api/x')).toBeUndefined();
    await expect(fetchJson('/api/x')).rejects.toThrow('answered 404');
  });

  it('throws on any other failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));

    await expect(findJson('/api/x')).rejects.toThrow('answered 500');
  });
});
