import { SlashCommandBuilder } from 'discord.js';

import { ephemeral } from '../embeds/general.js';
import { glossaryListEmbed, glossaryTermEmbed } from '../embeds/glossary.js';
import type { GameDataCache } from '../gameData.js';
import { MAX_QUERY_LENGTH, replyWithBest, respondWithMatches } from '../utils/search.js';
import type { Command, GlossaryEntry } from '../types.js';

export const keys = (entry: GlossaryEntry) => [entry.name];

export function createGlossaryCommand(gameData: GameDataCache): Command {
  return {
    data: new SlashCommandBuilder().setName('glossary').setDescription('Defines a game term.')
      .addStringOption((option) =>
        option.setName('term').setDescription('The term to define').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
      ).toJSON(),
    usage: '/glossary [term]',
    examples: ['/glossary term:fortitude', '/glossary term:crushing', '/glossary'],

    async autocomplete(interaction) {
      await respondWithMatches(interaction, gameData.get().glossary, keys, (entry) => ({ name: entry.name, value: entry.name }));
    },

    async execute(interaction) {
      const { glossary } = gameData.get();
      const query = interaction.options.getString('term');

      if (!query) {
        await interaction.reply(ephemeral(glossaryListEmbed(glossary)));

        return;
      }

      await replyWithBest(interaction, query, glossary, keys, {
        plural: 'terms',
        label: (entry) => entry.name,
        render: glossaryTermEmbed,
        notFound: { title: 'Term not found', description: `No entry for \`${query}\`. Run /glossary to see all ${glossary.length} terms.` },
      });
    },
  };
}
