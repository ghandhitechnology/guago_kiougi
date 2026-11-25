import { get } from "../api.ts";
import { h } from "../dom.ts";

export interface IpPreview {
  addresses: number;
  otherAccounts: number;
}

export const ipPreview = (accountId: string) =>
  get<{ preview: IpPreview }>(`/players/${encodeURIComponent(accountId)}/ip-preview`).then(
    (r) => r.preview,
  );

/**
 * The two IP-ban options, kept apart because players share a dormitory's one address: refusing
 * new accounts from it is the careful one; refusing every account on it locks out everyone
 * there, so it says how many that is.
 */
export function ipOptions(p: IpPreview): Node[] {
  if (p.addresses === 0) return [];
  const others = p.otherAccounts === 1 ? "1 other account" : `${p.otherAccounts} other accounts`;
  return [
    h(
      "label",
      null,
      h("input", { type: "checkbox", name: "ipSignup" }),
      `no new accounts from its ${p.addresses === 1 ? "address" : `${p.addresses} addresses`}`,
    ),
    h(
      "label",
      { class: p.otherAccounts > 0 ? "bad" : undefined },
      h("input", { type: "checkbox", name: "ipAll" }),
      `and lock out ${others} there`,
    ),
  ];
}

/** The scope the two boxes ask for; the second implies the first. */
export function ipScopeOf(d: FormData): "none" | "signup" | "all" {
  if (d.get("ipAll") === "on") return "all";
  return d.get("ipSignup") === "on" ? "signup" : "none";
}
