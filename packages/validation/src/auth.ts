import { z } from 'zod';
import {
  emailSchema,
  indianMobileSchema,
  otpCodeSchema,
  passwordSchema,
  personNameSchema,
} from './common';
import { MESSAGES } from './messages';

/**
 * A mobile number or an email address. Output is tagged so callers never have to guess:
 * `{ type: 'phone', value: '+919876543210' }` or `{ type: 'email', value: 'amit@example.com' }`.
 */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, MESSAGES.identifier.required)
  .transform((raw, ctx) => {
    const schema = raw.includes('@') ? emailSchema : indianMobileSchema;
    const result = schema.safeParse(raw);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: raw.includes('@') ? MESSAGES.email.invalid : MESSAGES.identifier.invalid,
      });
      return z.NEVER;
    }
    return {
      type: raw.includes('@') ? ('email' as const) : ('phone' as const),
      value: result.data,
    };
  });
export type Identifier = z.output<typeof identifierSchema>;

export const sendOtpSchema = z.object({ phone: indianMobileSchema });

export const verifyOtpSchema = z.object({ phone: indianMobileSchema, otp: otpCodeSchema });

export const registerSchema = z.object({
  signupToken: z.string().min(20).max(2048),
  fullName: personNameSchema,
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
});

export const passwordLoginSchema = z.object({
  identifier: identifierSchema,
  // Existing passwords are checked, not re-validated against the current policy.
  password: z.string().min(1, MESSAGES.password.required).max(128),
});

export const forgotPasswordSchema = z.object({ identifier: identifierSchema });

export const resetPasswordSchema = z.object({
  identifier: identifierSchema,
  otp: otpCodeSchema,
  newPassword: passwordSchema,
});

export const socialProviderSchema = z.enum(['google', 'apple']);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

export const socialLoginSchema = z.object({ idToken: z.string().min(20).max(8192) });

export const updateProfileSchema = z.object({ fullName: personNameSchema });

/** Change password (signed in). The same rules run in the form and on the server. */
export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, MESSAGES.changePassword.currentRequired).max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, MESSAGES.changePassword.confirmRequired),
  })
  .superRefine((v, ctx) => {
    if (v.confirmPassword && v.newPassword !== v.confirmPassword)
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: MESSAGES.changePassword.mismatch,
      });
    if (v.currentPassword && v.newPassword === v.currentPassword)
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: MESSAGES.changePassword.sameAsCurrent,
      });
  });
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
