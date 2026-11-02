import { SlashCommandBuilder } from 'discord.js';

import { randomBuildEmbed } from '../embeds/builds.js';
import { ephemeral } from '../embeds/general.js';
import { filterItems, type OwnedItem } from '../gameData.js';
import type { Command } from '../types.js';

const inRotation = ({ eternal }: OwnedItem) => !eternal || eternal.isActive;

const poolFor = (slot: string) => filterItems(null, slot).filter(inRotation);

function pickDistinct<T>(pool: T[], count: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(...remaining.splice(Math.floor(Math.random() * remaining.length), 1));
  }

  return picked;
}

export const randomBuildCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('randombuild')
    .setDescription('Rolls a random build: a crown, an amulet and two different weapons.')
    .toJSON(),
  usage: '/randombuild',
  examples: ['/randombuild'],

  async execute(interaction) {
    const build = [...pickDistinct(poolFor('crown'), 1), ...pickDistinct(poolFor('amulet'), 1), ...pickDistinct(poolFor('weapon'), 2)];
    await interaction.reply(ephemeral(randomBuildEmbed(build)));
  },
};
