import type { Command } from '../types.js';

export function isRequired(option: NonNullable<Command['data']['options']>[number]): boolean {
  return 'required' in option && Boolean(option.required);
}
