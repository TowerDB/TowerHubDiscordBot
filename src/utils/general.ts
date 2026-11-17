export function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Lowercase and trimmed, with runs of whitespace as one space, so comparisons ignore case and spacing. */
export function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}
