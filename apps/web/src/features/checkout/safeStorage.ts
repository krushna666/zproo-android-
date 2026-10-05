import type { StateStorage } from 'zustand/middleware';

/**
 * sessionStorage for checkout drafts (`zproo:draft:<module>`): per tab, cleared on logout, never
 * localStorage (drafts can hold dates of birth). Storage can throw (blocked in private modes);
 * the draft then lasts until reload.
 */
export const safeSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.sessionStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      window.sessionStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/**
 * A changed selection or traveller list replaces any hold made from the old one: release it so
 * the customer isn't blocked by their own seats (best effort; the hold lapses on its own anyway).
 */
export function releaseHold(reference: string | null): void {
  if (!reference) return;
  void import('./api')
    .then(({ checkoutApi }) => checkoutApi.releaseHold(reference))
    .catch(() => undefined);
}
