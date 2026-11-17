import type { Ability, AbilityLevel, AbilityStat } from '../types.js';
import { normalize } from './general.js';

/** Labels vary per ability, so these look like { "Damage": "10 / 10 / 20", "Cooldown": "7s" }. */
type Stats = Record<string, string>;

/** Shown when TowerHub has nothing yet for something Discord refuses to leave blank. */
export const NOTHING_YET = '—';

const UNIT_SUFFIXES: Partial<Record<AbilityStat['unit'], string>> = { Seconds: 's', Meters: 'm', Percent: '%' };
const NUMERALS = ['I', 'II', 'III'];

const numeral = (level: number) => NUMERALS[level - 1] ?? `${level}`;

/** Lowercase words with the punctuation dropped, e.g. "Blind Duration: 6s" gives "blind duration 6s". */
const plainWords = (text: string) => normalize(text.replace(/[^a-z0-9]+/gi, ' '));

// True when prose restates the stat change by naming the stat and repeating its numbers (e.g. "Blind Duration 6s" but not "Pirouette flings 2 knives").
function restates(effect: string, changes: Stats): boolean {
  const prose = plainWords(effect);

  return Object.entries(changes).every(([label, value]) => {
    const namesStat = plainWords(label).split(' ').every((word) => prose.includes(word));
    const digits = value.match(/\d+(?:\.\d+)?/g) ?? [];
    const repeatsValue = digits.length > 0 && digits.every((d) => prose.replace(/\s/g, '').includes(d.replace('.', '')));

    return namesStat && repeatsValue;
  });
}

/** Everything a level lists as label and display value, with damage first. */
function levelStats(level: AbilityLevel): Stats {
  const stats: Stats = level.damageText ? { Damage: level.damageText } : {};
  for (const { name, unit, value } of level.stats) {
    stats[name] = `${value}${UNIT_SUFFIXES[unit] ?? ''}`;
  }

  return stats;
}

function statParts(stats: Stats): string[] {
  return Object.entries(stats).map(([label, value]) => `**${label}**: ${value}`);
}

/** One level's row: what it moves, then its upgrade text unless that only says the same. Empty if it changes nothing. */
function upgradeRow(level: AbilityLevel, previous: Stats): string {
  const changes = Object.fromEntries(Object.entries(levelStats(level)).filter(([label, value]) => previous[label] !== value));
  const parts: string[] = [];

  if (Object.keys(changes).length) {
    parts.push(statParts(changes).join(', '));
  }
  if (level.upgradeEffect && !(parts.length && restates(level.upgradeEffect, changes))) {
    parts.push(level.upgradeEffect);
  }

  return parts.length ? `\`${numeral(level.level)}\` ${parts.join(' — ')}` : '';
}

/** The first level's stats in full, then one row per level above it showing only what that level adds. */
function statsBlock(ability: Ability): string {
  const rows: string[] = [];
  let previous: Stats | undefined;

  for (const level of ability.levels) {
    rows.push(previous ? upgradeRow(level, previous) : statParts(levelStats(level)).join('\n'));
    previous = levelStats(level);
  }

  return rows.filter(Boolean).join('\n');
}

/** A mechanic that arrives with an upgrade names the level, e.g. `Invulnerable III`. */
function mechanicTags(ability: Ability): string {
  return ability.mechanics
    .map(({ name, unlockedAtLevel }) => `\`${unlockedAtLevel > 1 ? `${name} ${numeral(unlockedAtLevel)}` : name}\``)
    .join(' ');
}

/** Renders one ability's body. The name is not included: each ability gets its own embed field, which carries it. */
export function abilityBlock(ability: Ability): string {
  return [ability.description, mechanicTags(ability), statsBlock(ability)].filter(Boolean).join('\n') || NOTHING_YET;
}
