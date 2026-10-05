import { create } from 'zustand';

/**
 * In-progress sign-in / sign-up / reset flows. Memory only: a page reload restarts the flow.
 * Starting a flow replaces any earlier one; signing out clears them. Codes and signup tokens are
 * single-use on the server, so leftover state after success is harmless.
 */
interface FlowState {
  otp: { phone: string; next: string; resendAt: number; devCode?: string | undefined } | null;
  signup: { phone: string; signupToken: string; next: string } | null;
  reset: { identifier: string; resendAt: number; devCode?: string | undefined } | null;
  startOtp: (
    phone: string,
    next: string,
    sent: { resendIn: number; devCode?: string | undefined },
  ) => void;
  startSignup: (phone: string, signupToken: string, next: string) => void;
  startReset: (
    identifier: string,
    sent: { resendIn: number; devCode?: string | undefined },
  ) => void;
  clear: () => void;
}

export const useAuthFlow = create<FlowState>()((set) => ({
  otp: null,
  signup: null,
  reset: null,
  startOtp: (phone, next, sent) =>
    set({
      otp: { phone, next, resendAt: Date.now() + sent.resendIn * 1000, devCode: sent.devCode },
      signup: null,
      reset: null,
    }),
  startSignup: (phone, signupToken, next) => set({ signup: { phone, signupToken, next } }),
  startReset: (identifier, sent) =>
    set({
      reset: { identifier, resendAt: Date.now() + sent.resendIn * 1000, devCode: sent.devCode },
      otp: null,
      signup: null,
    }),
  clear: () => set({ otp: null, signup: null, reset: null }),
}));
