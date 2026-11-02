import type { Command } from '../types.js';
import { buildCommand } from './build.js';
import { eternalsCommand } from './eternals.js';
import { faqCommand } from './faq.js';
import { glossaryCommand } from './glossary.js';
import { guideCommand } from './guide.js';
import { helpCommand } from './help.js';
import { itemCommand } from './item.js';
import { randomBuildCommand } from './randombuild.js';
import { socialsCommand } from './socials.js';

/** Order here is the order /help lists them in. */
export const commands: Command[] = [
  helpCommand,
  faqCommand,
  eternalsCommand,
  itemCommand,
  glossaryCommand,
  guideCommand,
  buildCommand,
  randomBuildCommand,
  socialsCommand,
];

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

export function findCommand(name: string): Command | undefined {
  return commandsByName.get(name);
}
