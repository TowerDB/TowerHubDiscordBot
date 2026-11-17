import { getConfig } from '../config.js';
import type { Eternal, GuideSummary, Item } from '../types.js';

function publicUrl(path: string): string {
  const { imageBaseUrl } = getConfig();

  return new URL(path, imageBaseUrl.endsWith('/') ? imageBaseUrl : `${imageBaseUrl}/`).href;
}

export const itemIcon = ({ slug }: Item): string => publicUrl(`images/items/${slug}.png`);
export const eternalPortrait = ({ slug }: Pick<Eternal, 'slug'>): string => publicUrl(`images/eternals/${slug}.png`);

/** The key names TowerHub's own art, and the eternals are the only ones with a copy here. */
export function guideThumbnail({ thumbnail }: GuideSummary): string | null {
  const slug = thumbnail?.match(/^eternal\/([a-z0-9-]+)$/)?.[1];

  return slug ? eternalPortrait({ slug }) : null;
}
