import { findCity } from '@zproo/config';

/** Recent bus searches (route + date only, no personal data), newest first, at most five. */
export interface RecentBusSearch {
  from: string;
  to: string;
  date: string;
}

const KEY = 'zproo:recent:bus';
const MAX = 5;

export function recentBusSearches(): RecentBusSearch[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (s): s is RecentBusSearch =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as RecentBusSearch).from === 'string' &&
          typeof (s as RecentBusSearch).to === 'string' &&
          typeof (s as RecentBusSearch).date === 'string' &&
          Boolean(findCity((s as RecentBusSearch).from) && findCity((s as RecentBusSearch).to)),
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberBusSearch(search: RecentBusSearch): void {
  try {
    const rest = recentBusSearches().filter(
      (s) => !(s.from === search.from && s.to === search.to && s.date === search.date),
    );
    window.localStorage.setItem(
      KEY,
      JSON.stringify(
        [{ from: search.from, to: search.to, date: search.date }, ...rest].slice(0, MAX),
      ),
    );
  } catch {
    /* storage blocked: nothing remembered */
  }
}
