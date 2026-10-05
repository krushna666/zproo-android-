import { create } from 'zustand';
import { clientNow } from '@/lib/clock';

/**
 * In-progress sign-in / sign-up / reset flows. Memory only: a page reload restarts the flow.
 * Starting a flow replaces any earlier one; signing out clears them. Codes and signup tokens are
 * single-use on the server, so leftover state after success is harmless.
 */
interface FlowState {
  otp: { phone: string; returnTo: string; resendAt: number; devCode?: string | undefined } | null;
  signup: { phone: string; signupToken: string; returnTo: string } | null;
  reset: { identifier: string; resendAt: number; devCode?: string | undefined } | null;
  startOtp: (
    phone: string,
    returnTo: string,
    sent: { resendIn: number; devCode?: string | undefined },
  ) => void;
  startSignup: (phone: string, signupToken: string, returnTo: string) => void;
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
  startOtp: (phone, returnTo, sent) =>
    set({
      otp: { phone, returnTo, resendAt: clientNow() + sent.resendIn * 1000, devCode: sent.devCode },
      signup: null,
      reset: null,
    }),
  startSignup: (phone, signupToken, returnTo) => set({ signup: { phone, signupToken, returnTo } }),
  startReset: (identifier, sent) =>
    set({
      reset: { identifier, resendAt: clientNow() + sent.resendIn * 1000, devCode: sent.devCode },
      otp: null,
      signup: null,
    }),
  clear: () => set({ otp: null, signup: null, reset: null }),
}));
