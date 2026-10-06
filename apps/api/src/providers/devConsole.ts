import { maskIdentifier } from '@zproo/utils';

/**
 * What the development console providers print: the recipient masked and one-time codes
 * redacted (SOP 5.2, P04 SEC-17: no OTP or full mobile in log output). Developers read the code
 * from the API's `devCode` and the app's development hint instead.
 */
export function devConsoleLine(kind: 'SMS' | 'EMAIL', to: string, text: string): string {
  return `\n[DEV ${kind} → ${maskIdentifier(to)}] ${text.replace(/\b\d{6}\b/g, '••••••')}\n\n`;
}
