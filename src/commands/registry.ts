import type { Content } from '../content.js';
import type { GameDataCache } from '../gameData.js';
import type { Command } from '../types.js';
import { createBuildCommand } from './build.js';
import { createEternalsCommand } from './eternals.js';
import { faqCommand } from './faq.js';
import { createGlossaryCommand } from './glossary.js';
import { createGuideCommand } from './guide.js';
import { createHelpCommand } from './help.js';
import { createItemCommand } from './item.js';
import { createRandomBuildCommand } from './randombuild.js';
import { socialsCommand } from './socials.js';

export interface CommandRegistry {
  commands: Command[];
  find(name: string): Command | undefined;
}

export function createRegistry(gameData: GameDataCache, content: Content): CommandRegistry {
  const commands: Command[] = [];
  // Order here is the order /help lists them in.
  commands.push(
    createHelpCommand(commands),
    faqCommand,
    createEternalsCommand(gameData),
    createItemCommand(gameData),
    createGlossaryCommand(gameData),
    createGuideCommand(content),
    createBuildCommand(gameData, content),
    createRandomBuildCommand(gameData),
    socialsCommand,
  );

  const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

  return { commands, find: (name) => commandsByName.get(name) };
}
