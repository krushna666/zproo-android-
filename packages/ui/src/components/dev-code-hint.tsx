/**
 * Shown only when codes aren't really sent: the API returns `devCode` only with the console SMS
 * provider outside production (or the static demo builds it in the browser).
 */
export function DevCodeHint({
  code,
  label = 'Development mode',
}: {
  code?: string | undefined;
  label?: string;
}) {
  if (!code) return null;
  return (
    <p
      data-testid="auth-dev-code"
      className="rounded-xl border border-dashed border-warning/60 bg-warning/10 px-3 py-2 text-center text-xs text-amber-800"
    >
      {label} — your code is <strong className="font-mono text-sm tracking-widest">{code}</strong>
    </p>
  );
}
