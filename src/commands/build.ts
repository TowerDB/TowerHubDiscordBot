import { SlashCommandBuilder } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

import { builds } from '../community.js';
import { buildEmbed, buildListEmbed } from '../embeds/builds.js';
import { ephemeral, ephemeralError, multipleMatchesEmbed } from '../embeds/general.js';
import { gameData, type OwnedItem } from '../gameData.js';
import type { BuildFilters, Command } from '../types.js';
import { replyWithResults, SORT_CHOICES, suggestAuthors, suggestResults } from '../utils/browse.js';
import { findBest, MAX_QUERY_LENGTH, respondWithMatches } from '../utils/search.js';
import { keys as eternalKeys } from './eternals.js';

const itemKeys = ({ item }: OwnedItem) => [item.name, item.slug];

/** Autocomplete only suggests, so these options can hold whatever was typed. */
function matchesOf({ options }: ChatInputCommandInteraction | AutocompleteInteraction) {
  const eternal = options.getString('eternal');
  const item = options.getString('item');

  return {
    eternals: eternal ? findBest(eternal, gameData().eternals, eternalKeys) : [],
    items: item ? findBest(item, gameData().items, itemKeys) : [],
  };
}

function filtersOf({ options }: ChatInputCommandInteraction | AutocompleteInteraction, eternal?: string, item?: string): BuildFilters {
  return { eternal, item, author: options.getString('author'), sort: options.getString('sort') };
}

/** The reply for a typed option that doesn't name one thing, or undefined if it does or it's empty. */
function refusal(noun: string, typed: string | null, names: string[]) {
  if (!typed || names.length === 1) {
    return undefined;
  }

  return names.length
    ? ephemeral(multipleMatchesEmbed(`${noun}s`, typed, names))
    : ephemeralError(`No such ${noun}`, `Nothing matched \`${typed}\`. Pick from the suggestions.`);
}

export const buildCommand: Command = {
  data: new SlashCommandBuilder().setName('build')
    .setDescription('Finds builds on TowerHub.')
    .addStringOption((option) =>
      option.setName('name').setDescription('Words from its name').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
    ).addStringOption((option) =>
      option.setName('eternal').setDescription('Uses one of this eternal\'s items').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
    ).addStringOption((option) =>
      option.setName('item').setDescription('Uses this item').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
    ).addStringOption((option) =>
      option.setName('author').setDescription('Who made it').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
    ).addStringOption((option) =>
      option.setName('sort').setDescription('Which come first').addChoices(...SORT_CHOICES),
    ).toJSON(),
  usage: '/build [name] [eternal] [item] [author] [sort]',
  examples: ['/build', '/build eternal:dahla sort:top', '/build item:ringblade'],

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true).name;
    if (focused === 'author') {
      await suggestAuthors(interaction, builds);

      return;
    }
    if (focused === 'eternal') {
      await respondWithMatches(interaction, gameData().eternals, eternalKeys, ({ name, slug }) => ({ name, value: slug }));

      return;
    }
    if (focused === 'item') {
      await respondWithMatches(interaction, gameData().items, itemKeys, ({ item }) => ({ name: item.name, value: item.slug }));

      return;
    }

    // Whatever can't be placed yet is left out rather than spoiling the suggestions. Running the command refuses it.
    const { eternals, items } = matchesOf(interaction);
    await suggestResults(interaction, builds, filtersOf(interaction, eternals[0]?.slug, items[0]?.item.slug), ({ name, author }) => `${name} — ${author}`);
  },

  async execute(interaction) {
    const { eternals, items } = matchesOf(interaction);
    const problem = refusal('eternal', interaction.options.getString('eternal'), eternals.map(({ name }) => name)) ??
      refusal('item', interaction.options.getString('item'), items.map(({ item }) => item.name));
    if (problem) {
      await interaction.reply(problem);

      return;
    }

    const [eternal] = eternals;
    const [owned] = items;
    await replyWithResults(interaction, {
      source: builds,
      filters: filtersOf(interaction, eternal?.slug, owned?.item.slug),
      detail: buildEmbed,
      list: (page, filters) => buildListEmbed(page, filters, [eternal?.name, owned?.item.name]),
      notFound: {
        title: 'No builds found',
        description: 'No build matches all of those options. Try fewer, or pick from the suggestions: `name:` has to be spelled as the build\'s name is, and `author:` needs the whole username.',
      },
    });
  },
};
