import {
  MESSAGES,
  emailSchema,
  identifierSchema,
  indianMobileSchema,
  otpCodeSchema,
  passwordSchema,
  personNameSchema,
} from '@zproo/validation';
import { z } from 'zod';

/** Form schemas built from the shared API schemas, so browser and server rules match. */

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  );

export const phoneFormSchema = z.object({ phone: indianMobileSchema });

export const passwordLoginFormSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, MESSAGES.password.required),
});

export const profileFormSchema = z.object({
  fullName: personNameSchema,
  email: optional(emailSchema),
  password: optional(passwordSchema),
});

export const forgotFormSchema = z.object({ identifier: identifierSchema });

export const resetFormSchema = z
  .object({
    otp: otpCodeSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, MESSAGES.changePassword.confirmRequired),
  })
  .refine((v) => !v.confirmPassword || v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: MESSAGES.changePassword.mismatch,
  });

export const nameFormSchema = z.object({ fullName: personNameSchema });
