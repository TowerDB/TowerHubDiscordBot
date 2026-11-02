import type { OwnedItem } from '../gameData.js';
import type { BuildDetails, BuildFilters, BuildSummary, Item, PagedResults } from '../types.js';
import { NOTHING_YET } from '../utils/abilities.js';
import { MAX_FIELD_VALUE } from '../utils/discordLimits.js';
import { truncate } from '../utils/general.js';
import { eternalPortrait, itemIcon } from '../utils/images.js';
import { escapeText, flattenMarkdown } from '../utils/markdown.js';
import { buildLink, buildsUrl, buildUrl, itemLink } from '../utils/towerhub.js';
import { baseEmbed, commonLabels, resultsEmbed } from './general.js';

const MAX_SUMMARY = 300;

/** The crown, amulet and weapons, which say what a build is. Most builds carry much the same anchor and consumable. */
const GEAR_COUNT = 4;

function buildLine({ item, eternal }: OwnedItem): string {
  return `\`${item.slot}\`: **${item.name}**${eternal?.name ? ` - *${eternal.name}*` : ''}`;
}

export function randomBuildEmbed(build: OwnedItem[]) {
  return baseEmbed('Random Build', build.map(buildLine).join('\n'))
    .setFooter({ text: '/item name: for any item\'s abilities · run it again to reroll' });
}

function loadoutLine(item: Item): string {
  return `\`${item.slot}\`: ${itemLink(item)}`;
}

/** A build keeps the game of its patch, so this says what has moved since. */
function outdated({ patch, changes, unavailableItems, outOfRotationItems }: BuildDetails): string {
  const notes = [
    [`Changed since ${patch}`, changes.map(({ name }) => name)],
    ['No longer in the game', unavailableItems],
    ['Out of rotation', outOfRotationItems],
  ] as const;

  return notes.filter(([, names]) => names.length).map(([label, names]) => `**${label}:** ${names.join(', ')}`).join('\n');
}

export function buildEmbed(build: BuildDetails) {
  const { crown, amulet, firstWeapon, secondWeapon, anchor, consumable } = build.loadout;
  const summary = escapeText(truncate(flattenMarkdown(build.summary), MAX_SUMMARY));
  const body = [`by ${escapeText(build.author)} · Patch ${build.patch}`, summary, outdated(build)].filter(Boolean).join('\n\n');
  const [setBonus] = build.setBonuses;

  return baseEmbed(escapeText(build.name), body)
    .setURL(buildUrl(build))
    .setThumbnail(setBonus ? eternalPortrait({ slug: setBonus.eternalSlug }) : itemIcon(crown))
    .addFields(
      { name: 'Loadout', value: [crown, amulet, firstWeapon, secondWeapon, anchor, consumable].map(loadoutLine).join('\n') },
      ...build.setBonuses.map(({ name, description }) => ({
        name: `Set Bonus: ${name}`,
        value: truncate(description || NOTHING_YET, MAX_FIELD_VALUE),
      })),
    )
    .setFooter({ text: '/item name: for any item\'s abilities' })
    .setTimestamp(new Date(build.updatedAt ?? build.publishedAt));
}

function buildEntry(build: BuildSummary): string {
  const gear = build.items.slice(0, GEAR_COUNT).map(({ name }) => name).join(' · ');

  return `**${buildLink(build)}** - by ${escapeText(build.author)}\n${gear}`;
}

/** `narrowedBy` names the eternal and item, which `filters` only has the slugs of. */
export function buildListEmbed({ items, total }: PagedResults<BuildSummary>, filters: BuildFilters, narrowedBy: Array<string | undefined>) {
  const labels = ['Builds', ...narrowedBy, ...commonLabels(filters.author, filters.sort)];

  return resultsEmbed(labels, items.map(buildEntry), total, buildsUrl(filters));
}
