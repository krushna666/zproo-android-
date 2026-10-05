import { z } from 'zod';
import {
  emailSchema,
  indianMobileSchema,
  otpCodeSchema,
  passwordSchema,
  personNameSchema,
} from './common';

/**
 * A mobile number or an email address. Output is tagged so callers never have to guess:
 * `{ type: 'phone', value: '+919876543210' }` or `{ type: 'email', value: 'amit@example.com' }`.
 */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your mobile number or email')
  .transform((raw, ctx) => {
    const schema = raw.includes('@') ? emailSchema : indianMobileSchema;
    const result = schema.safeParse(raw);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: raw.includes('@')
          ? 'Enter a valid email address'
          : 'Enter a valid 10-digit mobile number or email',
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
  password: z.string().min(1, 'Enter your password').max(128),
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
