import type { BuildDetails, BuildFilters, BuildSummary, GuideFilters, GuideSummary, ListFilters, PagedResults } from './types.js';
import { fetchJson, filtered, findJson } from './utils/towerhub.js';

/** Unlike game data these are never cached: each search is its own, and a deleted guide should go at once. */
export interface Source<Summary, Details, Filters> {
  list(filters: Filters, pageSize: number, timeoutMs?: number): Promise<PagedResults<Summary>>;
  /** Undefined when nothing has that slug. */
  find(slug: string): Promise<Details | undefined>;
  /** Those who have published one, up to 10, whose usernames start with the search. */
  authors(search: string, timeoutMs?: number): Promise<string[]>;
}

function source<Summary, Details, Filters extends ListFilters>(path: string): Source<Summary, Details, Filters> {
  return {
    list: (filters, pageSize, timeoutMs) => fetchJson(filtered(path, { ...filters, pageSize: String(pageSize) }), timeoutMs),
    find: (slug) => findJson(`${path}/${encodeURIComponent(slug)}`),
    authors: (search, timeoutMs) => fetchJson(filtered(`${path}/authors`, { search }), timeoutMs),
  };
}

/** A whole guide adds only its body, which the bot doesn't show. */
export const guides = source<GuideSummary, GuideSummary, GuideFilters>('/api/guides');
export const builds = source<BuildSummary, BuildDetails, BuildFilters>('/api/builds');
