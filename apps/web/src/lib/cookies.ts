/** Reads a browser cookie by name (undefined if absent, or outside the browser). */
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const item = part.trim();
    if (item.startsWith(prefix)) {
      try {
        return decodeURIComponent(item.slice(prefix.length));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
