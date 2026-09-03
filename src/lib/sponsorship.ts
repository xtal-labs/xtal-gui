/**
 * Helpers for stake-sponsored contracts.
 *
 * A stake output names the contract it backs. Stake on any contract counts
 * fully toward fruit-production eligibility; additionally, once a validator's
 * stake *on one contract* reaches that contract's fruit-type minimum, the
 * validator may produce fruits carrying gas-free calls to it.
 */

import type { CachedContract } from "@/types";

const HEX_40 = /^[0-9a-fA-F]{40}$/;

/** Canonical 0x-prefixed lowercase form of a 20-byte hex address. */
export function canonicalContractAddress(address: string): string {
  const t = address.trim();
  const hex = t.startsWith("0x") || t.startsWith("0X") ? t.slice(2) : t;
  return `0x${hex.toLowerCase()}`;
}

/**
 * Normalize a user-typed contract address (40 hex chars, optional 0x prefix)
 * to its canonical form, or `null` when it is not a well-formed address.
 * Contracts are never base58, so only hex is accepted.
 */
export function normalizeContractAddress(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const hex = t.startsWith("0x") || t.startsWith("0X") ? t.slice(2) : t;
  return HEX_40.test(hex) ? `0x${hex.toLowerCase()}` : null;
}

/** `0x1234…abcd` */
export function shortContractAddress(contract: string): string {
  const a = canonicalContractAddress(contract);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Gateway-imported contract matching `contract`, if any. */
export function findCachedContract(
  contract: string,
  cached: CachedContract[],
): CachedContract | undefined {
  const target = canonicalContractAddress(contract);
  return cached.find((c) => canonicalContractAddress(c.address) === target);
}

/** Human label for a contract: its imported name when known, else a short address. */
export function sponsorLabel(contract: string, cached: CachedContract[]): string {
  const match = findCachedContract(contract, cached);
  return match?.name ? match.name : shortContractAddress(contract);
}
