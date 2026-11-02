import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TtlCache } from '../src/utils/ttlCache.js';

const TTL = 30_000;

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers a repeat from memory until it expires, then loads again', async () => {
    const cache = new TtlCache<string>(TTL, 10);
    const load = vi.fn(async () => 'answer');

    await cache.get('a', load);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TTL + 1);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps different keys apart', async () => {
    const cache = new TtlCache<string>(TTL, 10);

    expect(await cache.get('a', async () => 'first')).toBe('first');
    expect(await cache.get('b', async () => 'second')).toBe('second');
  });

  it('shares one load between those who ask while it is running', async () => {
    const cache = new TtlCache<string>(TTL, 10);
    const load = vi.fn(async () => 'answer');

    await Promise.all([cache.get('a', load), cache.get('a', load), cache.get('a', load)]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not hold a failure, for those who ask during it or after', async () => {
    const cache = new TtlCache<string>(TTL, 10);
    const failing = vi.fn(async (): Promise<string> => {
      throw new Error('down');
    });

    await expect(cache.get('a', failing)).rejects.toThrow('down');
    expect(await cache.get('a', async () => 'back')).toBe('back');
  });

  it('drops the oldest once it holds more than its limit', async () => {
    const cache = new TtlCache<string>(TTL, 2);
    const load = vi.fn(async () => 'answer');

    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('c', load);
    expect(load).toHaveBeenCalledTimes(3);

    await cache.get('b', load);
    await cache.get('c', load);
    expect(load).toHaveBeenCalledTimes(3);

    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('forgets everything when cleared', async () => {
    const cache = new TtlCache<string>(TTL, 10);
    const load = vi.fn(async () => 'answer');

    await cache.get('a', load);
    cache.clear();
    await cache.get('a', load);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
