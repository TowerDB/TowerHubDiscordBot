import { ECHO, type ItemOwner, type OwnedItem } from '../gameData.js';
import type { Ability, Item } from '../types.js';
import { abilityBlock } from '../utils/abilities.js';
import { embedLength, MAX_FIELD_VALUE, MAX_MESSAGE_CHARS } from '../utils/discordLimits.js';
import { capitalize, truncate } from '../utils/general.js';
import { itemIcon } from '../utils/images.js';
import { eternalLink, itemLink, itemsUrl, itemUrl } from '../utils/towerhub.js';
import { baseEmbed } from './general.js';

const MAX_EMBEDS = 3;

const WEAPON_INPUTS = ['Primary', 'Secondary'];

/** Weapons bind two abilities, primary first; crown and amulet abilities have no input to label. */
function abilityField(item: Item, ability: Ability, index: number) {
  const label = item.slot === 'Weapon' ? WEAPON_INPUTS[index] : undefined;
  return {
    name: label ? `${label} - ${ability.name}` : ability.name,
    value: truncate(abilityBlock(ability), MAX_FIELD_VALUE),
  };
}

function detailEmbed({ item, eternal }: OwnedItem) {
  const owner = eternal && [`**${eternalLink(eternal)}**`, eternal.title].filter(Boolean).join(', ');
  const stacks = item.maxStackCount > 1 ? `Stacks to ${item.maxStackCount}` : undefined;
  const subtitle = [item.slot, owner, stacks].filter(Boolean).join(' - ');

  // Consumables repeat their ability's description as their own, and it's shown with the ability.
  const repeated = item.abilities.some((ability) => ability.description === item.description);
  const body = [subtitle, repeated ? null : item.description, item.lore && `*${item.lore}*`].filter(Boolean).join('\n\n');

  const embed = baseEmbed(item.name, body).setURL(itemUrl(item)).setThumbnail(itemIcon(item));
  if (item.abilities.length) {
    embed.addFields(...item.abilities.map((ability, index) => abilityField(item, ability, index)));
  }

  return eternal ? embed.setFooter({ text: `/eternals name:${eternal.slug} for the rest of the set` }) : embed;
}

/** A detail embed per match, or undefined when they won't fit in one message and a list should be shown instead. */
export function itemDetailEmbeds(matches: OwnedItem[]) {
  if (matches.length > MAX_EMBEDS) {
    return undefined;
  }

  const embeds = matches.map(detailEmbed);
  if (embeds.reduce((sum, embed) => sum + embedLength(embed), 0) > MAX_MESSAGE_CHARS) {
    return undefined;
  }

  // One closing hint rather than the same footer on every embed.
  for (const embed of embeds.slice(0, -1)) {
    embed.setFooter(null);
  }

  return embeds;
}

/** Titled by the eternal and slot options that narrowed it down, e.g. "Echo - Weapons", and linked to the same list on TowerHub. */
export function itemListEmbed(matches: OwnedItem[], owner: ItemOwner | undefined, slot: string | null) {
  const slotName = slot ? capitalize(slot) : undefined;
  const label = [owner?.name, slotName && `${slotName}s`].filter(Boolean).join(' - ');
  const options = matches.map(({ item, eternal }) => `\`${item.slot}\` ${itemLink(item)}${eternal ? ` — *${eternal.name}*` : ''}`).join('\n');

  // TowerHub has no filter for Echo, so an Echo list opens on everything in the slot.
  const eternal = owner === ECHO ? undefined : owner?.slug;

  return baseEmbed(label || 'Matching items', `${matches.length} items:\n\n${options}`).setURL(itemsUrl({ eternal, slot: slotName })).setFooter({
    text: 'Narrow it with the eternal and slot options.',
  });
}

/** What /item does, for when it's run with no options. */
export function itemsOverviewEmbed(count: number) {
  return baseEmbed('Items',
    `${count} items across the roster.\n\n` +
      '`/item eternal: slot:` — browse, e.g. Dahla + Crown, or Echo + Weapon\n' +
      '`/item name:` — search by item or ability, with autocomplete\n\n' +
      'The options combine, and any one of them works on its own. ' +
      'Anchors and consumables are under `slot:`.',
  ).setURL(itemsUrl());
}
