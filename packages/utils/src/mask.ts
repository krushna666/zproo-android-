/** `+919876543210` → `+91 98XXXXXX10` (for logs and messages; never the full number). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/^\+91/, '').replace(/\D/g, '');
  if (digits.length !== 10) return '+91 XXXXXXXXXX';
  return `+91 ${digits.slice(0, 2)}XXXXXX${digits.slice(8)}`;
}

/** `amit.sharma@example.com` → `a***@example.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

export const maskIdentifier = (value: string) =>
  value.includes('@') ? maskEmail(value) : maskPhone(value);
