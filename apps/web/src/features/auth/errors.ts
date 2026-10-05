import { toast } from '@zproo/ui';
import { TOASTS } from '@zproo/validation';
import { userMessage } from '@/lib/apiErrors';

/** User-facing message for a failed request (the SOP copy for its error code). */
export function errorMessage(error: unknown): string {
  return userMessage(error);
}

/**
 * Passed as react-hook-form's invalid handler: the SOP toast. react-hook-form has already moved
 * focus to the first invalid field and each field shows its own message below it.
 */
export function invalidForm(): void {
  toast.error(TOASTS.fixErrors);
}
