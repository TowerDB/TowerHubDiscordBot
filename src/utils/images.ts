import { config } from '../config.js';
import type { Eternal, GuideSummary, Item } from '../types.js';

const baseUrl = config.imageBaseUrl.endsWith('/') ? config.imageBaseUrl : `${config.imageBaseUrl}/`;

const publicUrl = (path: string): string => new URL(path, baseUrl).href;

export const itemIcon = ({ slug }: Item): string => publicUrl(`images/items/${slug}.png`);
export const eternalPortrait = ({ slug }: Pick<Eternal, 'slug'>): string => publicUrl(`images/eternals/${slug}.png`);

/** The key names TowerHub's own art, and the eternals are the only ones with a copy here. */
export function guideThumbnail({ thumbnail }: GuideSummary): string | null {
  const slug = thumbnail?.match(/^eternal\/([a-z0-9-]+)$/)?.[1];

  return slug ? eternalPortrait({ slug }) : null;
}
