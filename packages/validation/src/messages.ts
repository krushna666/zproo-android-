/**
 * The exact user-facing copy from the UI Style SOP (§4.3). Every form and API validator uses these
 * constants; never write a new message for a field that already has one.
 */
export const MESSAGES = {
  email: { invalid: 'Enter a valid email address', tooLong: 'Email is too long' },
  password: {
    required: 'Password is required',
    tooShort: 'Password must be at least 8 characters',
    tooLong: 'Password must be at most 128 characters',
    lettersAndNumbers: 'Password must contain letters and numbers',
  },
  mobile: { invalid: 'Enter a valid 10-digit mobile number' },
  name: {
    tooShort: 'Name is too short',
    tooLong: 'Name is too long',
    invalidCharacters: 'Name contains invalid characters',
  },
  otp: { invalid: 'Enter the 6-digit code' },
  identifier: {
    required: 'Enter your mobile number or email',
    invalid: 'Enter a valid 10-digit mobile number or email',
  },
  changePassword: {
    currentRequired: 'Enter your current password',
    confirmRequired: 'Confirm your new password',
    mismatch: 'Passwords do not match',
    sameAsCurrent: 'New password must be different from your current password',
  },
} as const;

/** Toast copy from the SOP. */
export const TOASTS = {
  loginSuccess: 'Login successful!',
  /** `+91 9876543210` */
  otpSent: (maskedPhone: string) => `OTP sent to ${maskedPhone}`,
  fixErrors: 'Please fix the errors',
  invalidMobile: 'Enter a valid mobile number',
  fallback: 'Something went wrong. Please try again.',
  sessionExpired: 'Your session expired. Please log in again.',
} as const;
