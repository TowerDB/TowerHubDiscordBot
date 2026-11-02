import { config } from '../config.js';
import type { BuildFilters, BuildSummary, Eternal, GuideFilters, GuideSummary, Item, ListFilters } from '../types.js';
import { escapeLabel } from './markdown.js';

/** TowerHub can spend a few seconds checking for a new game build before it answers. */
const TIMEOUT_MS = 15_000;

/** Said to be the bot, so TowerHub's operator can tell its traffic apart. */
const USER_AGENT = 'TowerHubDiscordBot (+https://towerhub.io)';

/** TowerHub refused because too many questions were coming. Not an outage. */
export class TowerHubBusyError extends Error {}

const url = (path: string): string => new URL(path, config.towerHubUrl).href;

export const eternalsUrl = (): string => url('/eternals');
export const eternalUrl = ({ slug }: Eternal): string => url(`/eternals/${slug}`);
export const itemUrl = ({ slug }: Item): string => url(`/items/${slug}`);
export const guideUrl = ({ slug }: GuideSummary): string => url(`/guides/${slug}`);
export const buildUrl = ({ slug }: Pick<BuildSummary, 'slug'>): string => url(`/builds/${slug}`);

/** The address with each filter that has a value. */
export function filtered(path: string, filters: ListFilters): string {
  const address = new URL(path, config.towerHubUrl);
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      address.searchParams.set(key, value);
    }
  }

  return address.href;
}

/** The items page opens filtered by its address. `eternal` is a slug, and `slot` must match TowerHub's casing, e.g. "Weapon". */
export function itemsUrl(filters: { eternal?: string; slot?: string } = {}): string {
  return filtered('/items', filters);
}

export const guidesUrl = (filters: GuideFilters): string => filtered('/guides', filters);
export const buildsUrl = (filters: BuildFilters): string => filtered('/builds', filters);

export const eternalLink = (eternal: Eternal): string => `[${eternal.name}](${eternalUrl(eternal)})`;
export const itemLink = (item: Item): string => `[${item.name}](${itemUrl(item)})`;
export const guideLink = (guide: GuideSummary): string => `[${escapeLabel(guide.title)}](${guideUrl(guide)})`;
export const buildLink = (build: BuildSummary): string => `[${escapeLabel(build.name)}](${buildUrl(build)})`;

/** Undefined when TowerHub has nothing at that address. */
export async function findJson<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T | undefined> {
  const response = await fetch(url(path), {
    headers: { 'User-Agent': USER_AGENT, 'X-Bot-Key': config.towerHubBotKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) {
    return undefined;
  }
  if (response.status === 429) {
    throw new TowerHubBusyError(`GET ${path} answered 429.`);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} answered ${response.status}.`);
  }

  return await response.json() as T;
}

export async function fetchJson<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const found = await findJson<T>(path, timeoutMs);
  if (found === undefined) {
    throw new Error(`GET ${path} answered 404.`);
  }

  return found;
}
