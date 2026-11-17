import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FaqTopic, SocialLink } from './types.js';
import { MAX_FIELD_VALUE, MAX_MESSAGE_CHARS } from './utils/discordLimits.js';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');

function load<T>(file: string): T[] {
  const contents = readFileSync(resolve(dataDir, file), 'utf8');
  const parsed: unknown = JSON.parse(contents);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${file} to contain a JSON array.`);
  }

  return parsed as T[];
}

export const faq: FaqTopic[] = load<FaqTopic>('faq.json');
export const socials: SocialLink[] = load<SocialLink>('socials.json');

// /faq shows a topic as one embed. Discord rejects the whole reply if any of these limits is
// exceeded, so catch it at startup rather than when someone runs the command.
for (const { topic, entries } of faq) {
  if (entries.length === 0 || entries.length > 10) {
    throw new Error(`FAQ topic "${topic}" has ${entries.length} questions; it needs 1 to 10.`);
  }

  for (const { question, answer } of entries) {
    if (answer.length > MAX_FIELD_VALUE) {
      throw new Error(`FAQ answer to "${question}" is ${answer.length} characters; the limit is ${MAX_FIELD_VALUE}.`);
    }
  }

  const length = entries.reduce((total, qa, index) => total + `${index + 1}. ${qa.question}`.length + qa.answer.length, topic.length);
  if (length > MAX_MESSAGE_CHARS) {
    throw new Error(`FAQ topic "${topic}" is ${length} characters; one topic must fit in ${MAX_MESSAGE_CHARS}.`);
  }
}
