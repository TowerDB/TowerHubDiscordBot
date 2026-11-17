import { SlashCommandBuilder } from 'discord.js';

import { ephemeral, ephemeralError } from '../embeds/general.js';
import { itemDetailEmbeds, itemListEmbed, itemsOverviewEmbed } from '../embeds/items.js';
import { ECHO, type GameDataCache, type ItemOwner, type OwnedItem } from '../gameData.js';
import { shareable } from '../share.js';
import { findBest, MAX_QUERY_LENGTH, resolveOne, respondWithMatches } from '../utils/search.js';
import type { Command } from '../types.js';

/** Searchable by item name, the abilities it grants, and its owner. */
export const keys = ({ item, eternal }: OwnedItem) => [
  item.name,
  item.slug,
  ...(eternal ? [eternal.name, `${eternal.name}'s ${item.name}`] : ['echo']),
  ...item.abilities.map((ability) => ability.name),
];

const SLOTS = ['Crown', 'Amulet', 'Weapon', 'Anchor', 'Consumable'] as const;

const ownerKeys = (owner: ItemOwner) => [owner.name, owner.slug];

export function createItemCommand(gameData: GameDataCache): Command {
  const owners = (): ItemOwner[] => [ECHO, ...gameData.get().eternals];

  /** Autocomplete only suggests, so the option can hold whatever was typed. */
  function findOwner(query: string): ItemOwner | undefined {
    return findBest(query, owners(), ownerKeys)[0];
  }

  return {
    data: new SlashCommandBuilder().setName('item')
      .setDescription('Shows an item and the abilities it grants.')
      .addStringOption((option) =>
        option.setName('eternal')
          .setDescription('Whose item, or Echo for the ones tied to no eternal')
          .setAutocomplete(true)
          .setMaxLength(MAX_QUERY_LENGTH),
      ).addStringOption((option) =>
        option.setName('slot')
          .setDescription('Which slot')
          .addChoices(...SLOTS.map((slot) => ({ name: slot, value: slot.toLowerCase() }))),
      ).addStringOption((option) =>
        option.setName('name').setDescription('Item or ability name').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
      ).toJSON(),
    usage: '/item [eternal] [slot] [name]',
    examples: ['/item eternal:dahla slot:crown', '/item eternal:rynshi slot:weapon', '/item name:ringblade'],

    async autocomplete(interaction) {
      if (interaction.options.getFocused(true).name === 'eternal') {
        await respondWithMatches(interaction, owners(), ownerKeys, (owner) => ({ name: owner.name, value: owner.slug }));

        return;
      }

      const typedOwner = interaction.options.getString('eternal');
      const owner = typedOwner ? findOwner(typedOwner) : undefined;
      const roster = gameData.filterItems(owner?.slug ?? null, interaction.options.getString('slot'));
      await respondWithMatches(interaction, roster, keys, ({ item }) => ({ name: item.name, value: item.name }));
    },

    async execute(interaction) {
      const name = interaction.options.getString('name');
      const typedOwner = interaction.options.getString('eternal');
      const slot = interaction.options.getString('slot');

      let owner: ItemOwner | undefined;
      if (typedOwner) {
        const resolved = resolveOne(typedOwner, owners(), ownerKeys, {
          plural: 'eternals',
          label: (candidate) => candidate.name,
          notFound: { title: 'No such eternal', description: `No eternal matched \`${typedOwner}\`. Run /eternals to see the full list.` },
        });
        if (resolved.refusal) {
          await interaction.reply(resolved.refusal);

          return;
        }
        owner = resolved.item;
      }

      let matches = gameData.filterItems(owner?.slug ?? null, slot);
      if (name) {
        const found = findBest(name, matches, keys);
        if (!found.length) {
          await interaction.reply(ephemeralError('No such item', `Nothing matched \`${name}\`. Try /eternals to browse the roster.`));

          return;
        }
        matches = found;
      }

      if (!name && !owner && !slot) {
        await interaction.reply(ephemeral(itemsOverviewEmbed(gameData.get().items.length)));

        return;
      }

      // e.g. eternal:dahla slot:anchor, since anchors are all Echo items. Discord rejects a reply with no embeds.
      if (!matches.length) {
        await interaction.reply(ephemeralError('No such item', 'No item matches all of those options. Try fewer, or /eternals to browse the roster.'));

        return;
      }

      // Show details if the embeds fit, otherwise a list
      const details = itemDetailEmbeds(matches);
      if (details) {
        await interaction.reply(shareable(...details));

        return;
      }

      await interaction.reply(shareable(itemListEmbed(matches, owner, slot)));
    },
  };
}
