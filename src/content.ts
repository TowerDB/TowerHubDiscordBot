import type { BuildDetails, BuildFilters, BuildSummary, GuideFilters, GuideSummary, ListFilters, PagedResults } from './types.js';
import { TtlCache } from './utils/ttlCache.js';
import { fetchJson, filtered, findJson } from './utils/towerhub.js';

/** Held for a short while, as every search is a call to TowerHub and people repeat themselves. A deleted guide lingers this long. */
const TTL_MS = 30_000;
const MAX_ENTRIES = 200;
const lists = new TtlCache<PagedResults<unknown>>(TTL_MS, MAX_ENTRIES);
const details = new TtlCache<unknown>(TTL_MS, MAX_ENTRIES);

export function clearContentCache(): void {
  lists.clear();
  details.clear();
}

export interface Source<Summary, Details, Filters> {
  list(filters: Filters, pageSize: number, timeoutMs?: number): Promise<PagedResults<Summary>>;
  /** Undefined when nothing has that slug. */
  find(slug: string): Promise<Details | undefined>;
  /** Those who have published one, up to 10, whose usernames start with the search. */
  authors(search: string, timeoutMs?: number): Promise<string[]>;
}

function source<Summary, Details, Filters extends ListFilters>(path: string): Source<Summary, Details, Filters> {
  return {
    list: (filters, pageSize, timeoutMs) => {
      const address = filtered(path, { ...filters, pageSize: String(pageSize) });

      return lists.get(address, () => fetchJson(address, timeoutMs)) as Promise<PagedResults<Summary>>;
    },
    find: (slug) => {
      const address = `${path}/${encodeURIComponent(slug)}`;

      return details.get(address, () => findJson(address)) as Promise<Details | undefined>;
    },
    authors: (search, timeoutMs) => fetchJson(filtered(`${path}/authors`, { search }), timeoutMs),
  };
}

/** A whole guide adds only its body, which the bot doesn't show. */
export const guides = source<GuideSummary, GuideSummary, GuideFilters>('/api/guides');
export const builds = source<BuildSummary, BuildDetails, BuildFilters>('/api/builds');
