import type { Eternal, Item } from '../types.js';
import { abilityBlock, NOTHING_YET } from '../utils/abilities.js';
import { MAX_FIELD_VALUE } from '../utils/discordLimits.js';
import { truncate } from '../utils/general.js';
import { eternalPortrait } from '../utils/images.js';
import { eternalLink, eternalsUrl, eternalUrl, itemLink } from '../utils/towerhub.js';
import { baseEmbed } from './general.js';

/** `items` are the eternal's own, which the caller reads from the game data. */
export function eternalDetailEmbed(eternal: Eternal, items: Item[]) {
  const { ability } = eternal;

  const title = [eternal.name, eternal.title].filter(Boolean).join(' — ');
  const embed = baseEmbed(title, eternal.description).setURL(eternalUrl(eternal)).setThumbnail(eternalPortrait(eternal));

  if (ability) {
    embed.addFields({ name: `Eternal Ability: ${ability.name}`, value: truncate(abilityBlock(ability), MAX_FIELD_VALUE) });
  }

  // Set bonus
  embed.addFields({
    name: `Set Bonus: ${eternal.setBonusName}`,
    value: truncate(eternal.setBonusDescription || NOTHING_YET, MAX_FIELD_VALUE),
  });

  // Item list. Item abilities can be found using /item
  const itemLines = items.map((item) => `\`${item.slot}\` **${itemLink(item)}**`);
  if (itemLines.length) {
    embed.addFields({ name: 'Items', value: truncate(itemLines.join('\n'), MAX_FIELD_VALUE) });
  }

  return embed.setFooter({ text: "/item for an item's abilities · /glossary explains any tag" });
}

export function eternalListEmbed(eternals: Eternal[]) {
  const lines = eternals.map((eternal) => `**${eternalLink(eternal)}**`).join('\n');
  return baseEmbed(`Eternals (${eternals.length})`, lines || 'No eternals are configured yet.').setURL(eternalsUrl()).setFooter({
    text: 'Use /eternals <name> for details on one.',
  });
}
