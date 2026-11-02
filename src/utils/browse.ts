import { MessageFlags } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { Source } from '../content.js';
import { ephemeralError } from '../embeds/general.js';
import { shareable } from '../share.js';
import type { ListFilters, PagedResults } from '../types.js';
import { MAX_CHOICE_NAME, MAX_CHOICES } from './discordLimits.js';
import { truncate } from './general.js';
import { TowerHubBusyError } from './towerhub.js';
import { asEdit } from './replies.js';
import { TtlCache } from './ttlCache.js';

const PAGE_SIZE = 10;

/** Autocomplete can't be deferred and Discord drops an answer after 3 seconds, so suggestions give up before that. */
const SUGGESTION_TIMEOUT_MS = 2_000;

/** Marks a picked suggestion. Titles aren't unique and TowerHub's search doesn't read slugs, so a pick can't be searched for. */
const PICKED = 'slug:';

export const SORT_CHOICES = ['Latest', 'Trending', 'Top'].map((name) => ({ name, value: name.toLowerCase() }));

interface Choice {
  name: string;
  value: string;
}

/** Keystrokes reach TowerHub unthrottled, and people type the same few things. A little staleness is harmless in a suggestion. */
const SUGGESTION_TTL_MS = 30_000;
const MAX_CACHED_SUGGESTIONS = 500;
const suggestions = new TtlCache<Choice[]>(SUGGESTION_TTL_MS, MAX_CACHED_SUGGESTIONS);

/** TowerHub reads what's typed without regard to case, so typing it differently is the same question. */
const cacheKey = (...parts: unknown[]): string => JSON.stringify(parts).toLowerCase();

export function clearSuggestions(): void {
  suggestions.clear();
}

/** With no answer Discord shows "Loading options failed", which says less than an empty list and looks like a bug. */
async function respondLive(interaction: AutocompleteInteraction, key: string, load: () => Promise<Choice[]>): Promise<void> {
  const choices = await suggestions.get(key, load).catch((error: unknown) => {
    console.warn(`Suggestions for /${interaction.commandName} failed:`, error);

    return [];
  });

  await interaction.respond(choices);
}

export async function suggestAuthors<Summary, Details, Filters>(
  interaction: AutocompleteInteraction,
  source: Source<Summary, Details, Filters>,
): Promise<void> {
  const typed = interaction.options.getFocused().trim();

  await respondLive(interaction, cacheKey(interaction.commandName, 'author', typed), async () => {
    const authors = await source.authors(typed, SUGGESTION_TIMEOUT_MS);

    return authors.map((author) => ({ name: author, value: author }));
  });
}

/** Offers what the filters chosen so far would find. */
export async function suggestResults<Summary extends { slug: string }, Details, Filters extends ListFilters>(
  interaction: AutocompleteInteraction,
  source: Source<Summary, Details, Filters>,
  filters: Filters,
  label: (result: Summary) => string,
): Promise<void> {
  const asked = { ...filters, search: interaction.options.getFocused().trim() };

  await respondLive(interaction, cacheKey(interaction.commandName, asked), async () => {
    const { items } = await source.list(asked, MAX_CHOICES, SUGGESTION_TIMEOUT_MS);

    return items.map((item) => ({ name: truncate(label(item), MAX_CHOICE_NAME), value: `${PICKED}${item.slug}` }));
  });
}

interface Results<Summary, Details, Filters> {
  source: Source<Summary, Details, Filters>;
  filters: Filters;
  detail(details: Details): EmbedBuilder;
  list(page: PagedResults<Summary>, filters: Filters): EmbedBuilder;
  notFound: { title: string; description: string };
}

/** The embed for what the `name:` option holds and the filters allow, or undefined if there's nothing to show. */
async function findResults<Summary extends { slug: string }, Details, Filters extends ListFilters>(
  name: string | null,
  { source, filters, detail, list }: Results<Summary, Details, Filters>,
): Promise<EmbedBuilder | undefined> {
  async function open(slug: string): Promise<EmbedBuilder | undefined> {
    const details = await source.find(slug);

    return details === undefined ? undefined : detail(details);
  }

  if (name?.startsWith(PICKED)) {
    return open(name.slice(PICKED.length));
  }

  const searched = { ...filters, search: name };
  const page = await source.list(searched, PAGE_SIZE);
  const [first] = page.items;
  if (!first) {
    return undefined;
  }

  return page.total === 1 ? open(first.slug) : list(page, searched);
}

/** Whatever went wrong asking, from a timeout to a 500, reads the same to the person who ran the command. */
const UNAVAILABLE = 'TowerHub is unavailable at the moment. Please try again later.';

export async function replyWithResults<Summary extends { slug: string }, Details, Filters extends ListFilters>(
  interaction: ChatInputCommandInteraction,
  results: Results<Summary, Details, Filters>,
): Promise<void> {
  // TowerHub can take longer than the 3 seconds Discord allows, and only deferring buys more.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let reply: Parameters<typeof asEdit>[0];
  try {
    const embed = await findResults(interaction.options.getString('name'), results);
    const { title, description } = results.notFound;
    reply = embed ? shareable(embed) : ephemeralError(title, description);
  }
  catch (error) {
    console.error(`/${interaction.commandName} could not get an answer from TowerHub:`, error);
    reply = error instanceof TowerHubBusyError
      ? ephemeralError('Too many searches', 'A lot of people are searching right now. Please try again in a minute.')
      : ephemeralError('TowerHub unavailable', UNAVAILABLE);
  }

  await interaction.editReply(asEdit(reply));
}
