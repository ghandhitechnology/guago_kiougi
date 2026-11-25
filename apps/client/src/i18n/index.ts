import { ko } from "./ko.ts";

/** Every string a player reads goes through a key (PLAN decision 11). Korean only for now. */
export type TextKey = keyof typeof ko;

const table: Readonly<Record<string, string>> = ko;

/** The copy for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key: TextKey, vars?: Readonly<Record<string, string | number>>): string {
  const text = table[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** For keys built at runtime, such as `hair.${style}`: the copy, or undefined when none exists. */
export function tMaybe(key: string): string | undefined {
  return table[key];
}
