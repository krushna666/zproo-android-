import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  identifierSchema,
  passwordLoginSchema,
  registerSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from './auth';
import { MESSAGES } from './messages';

describe('identifierSchema', () => {
  it('tags phone numbers and normalises them', () => {
    expect(identifierSchema.parse(' 98765 43210 ')).toEqual({
      type: 'phone',
      value: '+919876543210',
    });
  });

  it('tags emails and lower-cases them', () => {
    expect(identifierSchema.parse('Amit@Example.com')).toEqual({
      type: 'email',
      value: 'amit@example.com',
    });
  });

  it('explains what is wrong', () => {
    const phone = identifierSchema.safeParse('12345');
    expect(phone.success).toBe(false);
    expect(phone.error?.issues[0]?.message).toBe('Enter a valid 10-digit mobile number or email');
    const email = identifierSchema.safeParse('amit@');
    expect(email.error?.issues[0]?.message).toBe('Enter a valid email address');
  });
});

describe('registerSchema', () => {
  const base = { signupToken: 'x'.repeat(40), fullName: 'Amit Sharma' };

  it('makes email and password optional', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it('enforces the password policy when a password is given', () => {
    expect(registerSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('requires a 6-digit OTP and a strong password', () => {
    const ok = resetPasswordSchema.safeParse({
      identifier: '9876543210',
      otp: '123456',
      newPassword: 'n3wpassword',
    });
    expect(ok.success).toBe(true);
    const bad = resetPasswordSchema.safeParse({
      identifier: '9876543210',
      otp: '12',
      newPassword: 'weak',
    });
    expect(new Set(bad.error?.issues.map((i) => i.path[0]))).toEqual(
      new Set(['otp', 'newPassword']),
    );
  });
});

describe('SOP messages', () => {
  const first = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.error?.issues[0]?.message;

  it('uses the exact copy for every field', () => {
    expect(first(passwordLoginSchema.safeParse({ identifier: 'a@b.co', password: '' }))).toBe(
      'Password is required',
    );
    expect(first(passwordLoginSchema.safeParse({ identifier: '', password: 'x' }))).toBe(
      'Enter your mobile number or email',
    );
    expect(first(passwordLoginSchema.safeParse({ identifier: '12345', password: 'x' }))).toBe(
      'Enter a valid 10-digit mobile number or email',
    );
    expect(first(verifyOtpSchema.safeParse({ phone: '9876543210', otp: '12' }))).toBe(
      'Enter the 6-digit code',
    );
    expect(first(sendOtpSchema.safeParse({ phone: '5876543210' }))).toBe(
      'Enter a valid 10-digit mobile number',
    );
  });

  it('validates password changes', () => {
    const issues = (input: object) =>
      changePasswordSchema.safeParse(input).error?.issues.map((i) => i.message) ?? [];
    expect(issues({ currentPassword: '', newPassword: 'abc12345', confirmPassword: '' })).toEqual([
      'Enter your current password',
      'Confirm your new password',
    ]);
    expect(
      issues({ currentPassword: 'old12345', newPassword: 'abc12345', confirmPassword: 'abc1234' }),
    ).toEqual(['Passwords do not match']);
    expect(
      issues({ currentPassword: 'abc12345', newPassword: 'abc12345', confirmPassword: 'abc12345' }),
    ).toEqual(['New password must be different from your current password']);
    expect(MESSAGES.password.lettersAndNumbers).toBe('Password must contain letters and numbers');
  });
});
