import type { Currency } from '@zproo/types';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

interface PreferencesState {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

/** localStorage can throw (private mode, blocked storage); preferences then last for the session only. */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      currency: 'INR',
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: 'zproo.preferences',
      storage: createJSONStorage(() => safeLocalStorage),
      // Read saved preferences after hydration (main.tsx), so the first client render matches
      // the prerendered HTML.
      skipHydration: true,
    },
  ),
);
