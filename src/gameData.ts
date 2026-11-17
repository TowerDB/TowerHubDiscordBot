import type { Eternal, GlossaryEntry, Item } from './types.js';
import { logger, MS_PER_SECOND } from './utils/logging.js';
import { fetchJson } from './utils/towerhub.js';

/** How long loaded data is served before the next read sets off a refresh. */
const TTL_MS = 30 * 60_000;
/** How long what's cached keeps being served after a failed refresh, before the next try. */
const RETRY_MS = 60_000;
/** While nothing has loaded, the bot keeps trying by itself, starting here and doubling up to RETRY_MS. */
const FIRST_RETRY_MS = 5_000;

/** Nothing has loaded from TowerHub yet, e.g. it was down when the bot started. Commands tell the user to wait. */
export class GameDataNotLoadedError extends Error {
  constructor() {
    super('Game data has not loaded from TowerHub yet.');
  }
}

export interface OwnedItem {
  item: Item;
  eternal?: Eternal;
}

export interface ItemOwner {
  name: string;
  slug: string;
}

/** Not an eternal, but offered as one: it stands for the items that belong to none. */
export const ECHO: ItemOwner = { name: 'Echo', slug: 'echo' };

export interface GameData {
  eternals: Eternal[];
  items: OwnedItem[];
  glossary: GlossaryEntry[];
}

async function load(): Promise<GameData> {
  const [game, mechanics] = await Promise.all([
    fetchJson<{ eternals: Eternal[]; items: Item[] }>('/api/system/gamedata'),
    fetchJson<GlossaryEntry[]>('/api/mechanics'),
  ]);

  // Thrown rather than cached, so a bad response can't replace good data.
  if (![game.eternals, game.items, mechanics].every((list) => Array.isArray(list) && list.length > 0)) {
    throw new Error('TowerHub sent no eternals, items or glossary terms.');
  }

  const eternalsBySlug = new Map(game.eternals.map((eternal) => [eternal.slug, eternal]));

  return {
    eternals: game.eternals,
    items: game.items.map((item) => ({ item, eternal: eternalsBySlug.get(item.eternalSlug ?? '') })),
    glossary: mechanics,
  };
}

export class GameDataCache {
  private cached: GameData | undefined;
  private expiresAt = 0;
  private refreshing: Promise<void> | undefined;
  private failures = 0;

  /** Shared by everyone who asks while one is running. Never rejects: a failure leaves what's cached in place. */
  refresh(): Promise<void> {
    this.refreshing ??= this.runRefresh();

    return this.refreshing;
  }

  /**
   * Discord gives a command 3 seconds to answer, so this never waits on TowerHub. Once the data expires, the next read
   * still gets it and sets off a refresh. Throws only if nothing has loaded yet.
   */
  get(): GameData {
    if (Date.now() >= this.expiresAt) {
      void this.refresh();
    }
    if (!this.cached) {
      throw new GameDataNotLoadedError();
    }

    return this.cached;
  }

  filterItems(owner: string | null, slot: string | null): OwnedItem[] {
    let matches = this.get().items;
    if (owner === ECHO.slug) {
      matches = matches.filter(({ eternal }) => !eternal);
    }
    else if (owner) {
      matches = matches.filter(({ eternal }) => eternal?.slug === owner);
    }
    if (slot) {
      matches = matches.filter(({ item }) => item.slot.toLowerCase() === slot);
    }

    return matches;
  }

  /** The four items an eternal carries. */
  itemsOf(eternal: Eternal): Item[] {
    return this.filterItems(eternal.slug, null).map(({ item }) => item);
  }

  private async runRefresh(): Promise<void> {
    try {
      this.cached = await load();
      this.expiresAt = Date.now() + TTL_MS;
      this.failures = 0;
      logger.info(`Loaded ${this.cached.eternals.length} eternals, ${this.cached.items.length} items and ${this.cached.glossary.length} glossary terms from TowerHub.`);
    }
    catch (error) {
      this.failures += 1;
      const retryMs = this.cached ? RETRY_MS : Math.min(RETRY_MS, FIRST_RETRY_MS * 2 ** (this.failures - 1));
      this.expiresAt = Date.now() + retryMs;
      logger.error(`Failed to load game data from TowerHub. Trying again in ${retryMs / MS_PER_SECOND}s:`, error);

      // With nothing cached no command can run to set off the next try, so it's set off here.
      if (!this.cached) {
        setTimeout(() => void this.refresh(), retryMs).unref();
      }
    }
    finally {
      this.refreshing = undefined;
    }
  }
}
