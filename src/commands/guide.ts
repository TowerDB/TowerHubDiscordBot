import { SlashCommandBuilder } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

import type { Content } from '../content.js';
import { guideEmbed, guideListEmbed } from '../embeds/guides.js';
import type { Command, GuideFilters } from '../types.js';
import { replyWithResults, SORT_CHOICES, suggestAuthors, suggestResults } from '../utils/browse.js';
import { MAX_QUERY_LENGTH } from '../utils/search.js';

const CATEGORIES = ['General', 'Eternal', 'Community'];

function filtersOf({ options }: ChatInputCommandInteraction | AutocompleteInteraction): GuideFilters {
  return {
    category: options.getString('category'),
    author: options.getString('author'),
    sort: options.getString('sort'),
  };
}

export function createGuideCommand(content: Content): Command {
  return {
    data: new SlashCommandBuilder().setName('guide')
      .setDescription('Finds guides on TowerHub.')
      .addStringOption((option) =>
        option.setName('name').setDescription('Words from its title').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
      ).addStringOption((option) =>
        option.setName('category')
          .setDescription('Which kind of guide')
          .addChoices(...CATEGORIES.map((category) => ({ name: category, value: category.toLowerCase() }))),
      ).addStringOption((option) =>
        option.setName('author').setDescription('Who wrote it').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
      ).addStringOption((option) =>
        option.setName('sort').setDescription('Which come first').addChoices(...SORT_CHOICES),
      ).toJSON(),
    usage: '/guide [name] [category] [author] [sort]',
    examples: ['/guide', '/guide name:dahla category:eternal', '/guide category:community sort:top'],

    async autocomplete(interaction) {
      if (interaction.options.getFocused(true).name === 'author') {
        await suggestAuthors(interaction, content.guides);

        return;
      }

      await suggestResults(interaction, content.guides, filtersOf(interaction), ({ title, author }) => `${title} — ${author}`);
    },

    async execute(interaction) {
      await replyWithResults(interaction, {
        source: content.guides,
        filters: filtersOf(interaction),
        detail: guideEmbed,
        list: guideListEmbed,
        notFound: {
          title: 'No guides found',
          description: 'No guide matches all of those options. Try fewer, or pick from the suggestions: `name:` has to be spelled as the title is, and `author:` needs the whole username.',
        },
      });
    },
  };
}
