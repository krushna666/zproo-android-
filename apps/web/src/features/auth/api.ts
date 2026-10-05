import type { ApiSuccess, AuthSession, OtpSent, PublicUser, VerifyOtpResult } from '@zproo/types';
import { readCookie } from '@/lib/cookies';
import { apiGet, apiPost, http } from '@/services/http';

const csrf = () => ({ headers: { 'X-CSRF-Token': readCookie('zp_csrf') ?? '' } });

export const authApi = {
  sendOtp: (phone: string) => apiPost<OtpSent>('/auth/send-otp', { phone }),
  verifyOtp: (phone: string, otp: string) =>
    apiPost<VerifyOtpResult>('/auth/verify-otp', { phone, otp }),
  register: (input: { signupToken: string; fullName: string; email?: string; password?: string }) =>
    apiPost<AuthSession>('/auth/register', input),
  login: (identifier: string, password: string) =>
    apiPost<AuthSession>('/auth/login', { identifier, password }),
  social: (provider: 'google' | 'apple', idToken: string) =>
    apiPost<AuthSession>(`/auth/social/${provider}`, { idToken }),
  // Cookie-authenticated: echo the double-submit CSRF token the API set at sign-in.
  refresh: () => apiPost<AuthSession>('/auth/refresh', undefined, csrf()),
  logout: () => apiPost<null>('/auth/logout', undefined, csrf()),
  logoutAll: () => apiPost<null>('/auth/logout-all'),
  forgotPassword: (identifier: string) => apiPost<OtpSent>('/auth/forgot-password', { identifier }),
  resetPassword: (identifier: string, otp: string, newPassword: string) =>
    apiPost<null>('/auth/reset-password', { identifier, otp, newPassword }),
  me: () => apiGet<PublicUser>('/me'),
  updateMe: async (changes: { fullName: string }) =>
    (await http.patch<ApiSuccess<PublicUser>>('/me', changes)).data.data,
};
