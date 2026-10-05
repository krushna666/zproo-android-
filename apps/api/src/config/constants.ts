/** Authentication policy. Changing these is a security decision — document it in docs/SECURITY.md. */
export const AUTH = {
  otpLength: 6,
  otpTtlSeconds: 5 * 60,
  /** Password-reset codes live longer: the customer may be switching to their inbox. */
  resetOtpTtlSeconds: 10 * 60,
  otpResendSeconds: 30,
  /** Code sends allowed from one IP per hour (all numbers and flows together). */
  otpMaxSendsPerIpPerHour: 20,
  /** Deterministic code used only with NODE_ENV=test and ALLOW_TEST_OTP=true. */
  testOtpCode: '123456',
  otpMaxAttempts: 5,
  otpMaxSendsPerHour: 5,
  signupTokenTtlSeconds: 15 * 60,
  refreshCookieName: 'zp_rt',
  refreshCookiePath: '/api/auth',
  /** Double-submit CSRF token: readable by the web app, echoed in `X-CSRF-Token`. */
  csrfCookieName: 'zp_csrf',
  csrfHeader: 'X-CSRF-Token',
  issuer: 'zproo-go',
  audience: { access: 'zproo-go-api', signup: 'zproo-go-signup' },
} as const;
