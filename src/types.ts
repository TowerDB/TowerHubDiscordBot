import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export interface AbilityStat {
  name: string;
  unit: 'Seconds' | 'Meters' | 'Percent' | 'Points' | 'Count';
  value: number;
}

export interface AbilityLevel {
  level: number;
  /** Display text such as "15 / 15 / 10+10", which can't be compared or added to. */
  damageText: string | null;
  /** The upgrade in words. The stats already include the change it describes. */
  upgradeEffect: string | null;
  stats: AbilityStat[];
}

export interface Ability {
  name: string;
  description: string;
  /** Ordered by the level that unlocks them. Each is a glossary term. */
  mechanics: Array<{ name: string; definition: string; unlockedAtLevel: number }>;
  /** Every level, lowest first. Core abilities and basic attacks have only the one. */
  levels: AbilityLevel[];
}

export interface Item {
  slug: string;
  name: string;
  slot: 'Weapon' | 'Amulet' | 'Crown' | 'Consumable' | 'Anchor';
  /** Null for Echo items, which belong to no eternal. */
  eternalSlug: string | null;
  description: string | null;
  lore: string | null;
  maxStackCount: number;
  /** Weapons grant two, the primary basic attack then the secondary ability. Empty for anchors. */
  abilities: Ability[];
}

export interface Eternal {
  slug: string;
  name: string;
  /** Archetype, e.g. "The Dancer". TowerHub leaves this and the description empty until someone writes them for a new eternal. */
  title: string;
  description: string;
  setBonusName: string;
  setBonusDescription: string;
  /** Whether the eternal is currently in the game's rotation. */
  isActive: boolean;
  /** The core ability, or null if TowerHub has no version of it yet. */
  ability: Ability | null;
}

export interface GlossaryEntry {
  name: string;
  definition: string;
}

/** One page of a list on TowerHub. */
export interface PagedResults<T> {
  items: T[];
  /** Across every page. */
  total: number;
}

/** Filters are named as TowerHub's site and API both read them, so one set asks for a list and links to it. */
export type ListFilters = Record<string, string | null | undefined>;

export type GuideFilters = {
  search?: string | null;
  category?: string | null;
  author?: string | null;
  sort?: string | null;
};

export type BuildFilters = {
  search?: string | null;
  /** A slug. Matches builds with any of the eternal's items. */
  eternal?: string | null;
  /** A slug. */
  item?: string | null;
  author?: string | null;
  sort?: string | null;
};

/** Written by a user. See utils/markdown.ts before putting any of its text in an embed. */
export interface GuideSummary {
  slug: string;
  title: string;
  /** Plain text. */
  summary: string;
  author: string;
  category: 'General' | 'Eternal' | 'Community';
  publishedAt: string;
  /** Null until the guide is edited. */
  updatedAt: string | null;
  /** A key for TowerHub's own art, such as `eternal/dahla`. Null for its fallback image. */
  thumbnail: string | null;
  readingMinutes: number;
}

export interface BuildSetBonus {
  eternalSlug: string;
  name: string;
  /** As of the build's patch. */
  description: string;
}

/** Written by a user. See utils/markdown.ts before putting any of its text in an embed. */
export interface BuildSummary {
  slug: string;
  name: string;
  author: string;
  /** In loadout order: crown, amulet, the two weapons, then the anchor and the consumable. */
  items: Array<{ slug: string; name: string }>;
}

export interface BuildDetails {
  slug: string;
  name: string;
  /** Markdown. */
  summary: string;
  author: string;
  /** The version it's locked to, which was current when it was last saved. */
  patch: string;
  publishedAt: string;
  /** Null until the build is edited. */
  updatedAt: string | null;
  /** Each item as it was in the build's patch. */
  loadout: Record<'crown' | 'amulet' | 'firstWeapon' | 'secondWeapon' | 'anchor' | 'consumable', Item>;
  setBonuses: BuildSetBonus[];
  /** What has changed about its items and set bonuses since its patch. */
  changes: Array<{ name: string }>;
  unavailableItems: string[];
  outOfRotationItems: string[];
}

export interface SocialLink {
  name: string;
  url: string;
}

interface FaqEntry {
  question: string;
  answer: string;
}

/** /faq numbers the entries 1, 2, 3… in the order they are listed. */
export interface FaqTopic {
  topic: string;
  entries: FaqEntry[];
  aliases?: string[];
}

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  usage: string;
  examples: string[];
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
