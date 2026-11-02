import { SlashCommandBuilder } from 'discord.js';

import { eternalDetailEmbed, eternalListEmbed } from '../embeds/eternals.js';
import { gameData } from '../gameData.js';
import { shareable } from '../share.js';
import { MAX_QUERY_LENGTH, replyWithBest, respondWithMatches } from '../utils/search.js';
import type { Command, Eternal } from '../types.js';

export const keys = (eternal: Eternal) => [eternal.name, eternal.slug];

export const eternalsCommand: Command = {
  data: new SlashCommandBuilder().setName('eternals')
    .setDescription('Lists every eternal, or shows details for one.')
    .addStringOption((option) =>
      option.setName('name').setDescription('Which eternal').setAutocomplete(true).setMaxLength(MAX_QUERY_LENGTH),
    ).toJSON(),
  usage: '/eternals [name]',
  examples: ['/eternals', '/eternals name:dahla'],

  async autocomplete(interaction) {
    await respondWithMatches(interaction, gameData().eternals, keys, (eternal) => ({ name: eternal.name, value: eternal.slug }));
  },

  async execute(interaction) {
    const { eternals } = gameData();
    const query = interaction.options.getString('name');

    if (!query) {
      await interaction.reply(shareable(eternalListEmbed(eternals)));

      return;
    }

    await replyWithBest(interaction, query, eternals, keys, {
      plural: 'eternals',
      label: (eternal) => eternal.name,
      render: eternalDetailEmbed,
      notFound: { title: 'No such eternal', description: `No eternal matched \`${query}\`. Run /eternals to see the full list.` },
    });
  },
};
