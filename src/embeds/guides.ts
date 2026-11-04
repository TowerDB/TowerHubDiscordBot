import type { GuideFilters, GuideSummary, PagedResults } from '../types.js';
import { capitalize, truncate } from '../utils/general.js';
import { guideThumbnail } from '../utils/images.js';
import { escapeText } from '../utils/markdown.js';
import { guideLink, guidesUrl, guideUrl } from '../utils/towerhub.js';
import { baseEmbed, commonLabels, resultsEmbed } from './general.js';

const MAX_LISTED_SUMMARY = 120;

function byline({ category, author, readingMinutes }: GuideSummary): string {
  return [category, `by ${escapeText(author)}`, `${readingMinutes} min read`].join(' - ');
}

function guideEntry(guide: GuideSummary): string {
  const summary = escapeText(truncate(guide.summary, MAX_LISTED_SUMMARY));

  return [`**${guideLink(guide)}**`, byline(guide), summary].filter(Boolean).join('\n');
}

/** Its body stays on TowerHub: 20,000 characters of tables and images wouldn't fit, and wouldn't survive if they did. */
export function guideEmbed(guide: GuideSummary) {
  const body = [byline(guide), escapeText(guide.summary)].filter(Boolean).join('\n\n');

  return baseEmbed(escapeText(guide.title), body)
    .setURL(guideUrl(guide))
    .setThumbnail(guideThumbnail(guide))
    .setTimestamp(new Date(guide.updatedAt ?? guide.publishedAt));
}

export function guideListEmbed({ items, total }: PagedResults<GuideSummary>, filters: GuideFilters) {
  const { category, author, sort } = filters;
  const labels = ['Guides', category ? capitalize(category) : undefined, ...commonLabels(author, sort)];

  return resultsEmbed(labels, items.map(guideEntry), total, guidesUrl(filters));
}
