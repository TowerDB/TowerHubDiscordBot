import { SlashCommandBuilder } from 'discord.js';

import { randomBuildEmbed } from '../embeds/builds.js';
import { ephemeral } from '../embeds/general.js';
import type { GameDataCache, OwnedItem } from '../gameData.js';
import type { Command } from '../types.js';

const inRotation = ({ eternal }: OwnedItem) => !eternal || eternal.isActive;

function pickDistinct<T>(pool: T[], count: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(...remaining.splice(Math.floor(Math.random() * remaining.length), 1));
  }

  return picked;
}

export function createRandomBuildCommand(gameData: GameDataCache): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('randombuild')
      .setDescription('Rolls a random build: a crown, an amulet and two different weapons.')
      .toJSON(),
    usage: '/randombuild',
    examples: ['/randombuild'],

    async execute(interaction) {
      const poolFor = (slot: string) => gameData.filterItems(null, slot).filter(inRotation);
      const build = [...pickDistinct(poolFor('crown'), 1), ...pickDistinct(poolFor('amulet'), 1), ...pickDistinct(poolFor('weapon'), 2)];
      await interaction.reply(ephemeral(randomBuildEmbed(build)));
    },
  };
}
