import { render, screen, waitFor } from '@testing-library/react';
import { Toaster } from '@zproo/ui';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/services/http';
import { makeUser, renderRoute } from '@/test/render';
import { authApi } from './api';
import { useAuthFlow } from './flowStore';
import { useAuthStore } from './store';

vi.mock('./api', () => ({
  authApi: {
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    refresh: vi.fn(),
    social: vi.fn(),
    me: vi.fn(),
    updateMe: vi.fn(),
  },
}));

const api = vi.mocked(authApi);
const session = (overrides = {}) => ({
  user: makeUser(overrides),
  accessToken: 'access-1',
  expiresIn: 900,
});

beforeEach(() => {
  vi.clearAllMocks();
  useAuthFlow.getState().clear();
});

describe('mobile OTP sign-up', () => {
  it('goes from mobile number to OTP to profile to signed in', async () => {
    const user = userEvent.setup();
    api.sendOtp.mockResolvedValue({ expiresIn: 300, resendIn: 60, devCode: '482913' });
    api.verifyOtp.mockResolvedValue({
      status: 'SIGNUP_REQUIRED',
      signupToken: 'signup-token',
      phone: '+919876543210',
    });
    api.register.mockResolvedValue(session({ fullName: 'Riya Nair' }));

    const { router } = renderRoute('/signup?returnTo=/offers');
    await user.type(await screen.findByLabelText('Mobile number'), '98765 43210');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(api.sendOtp).toHaveBeenCalledWith('+919876543210');

    expect(await screen.findByRole('heading', { name: 'Verify OTP' })).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByText('482913')).toBeInTheDocument(); // development code hint
    expect(screen.getByText(/Resend OTP in/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('One-time code'), '482913');
    expect(api.verifyOtp).toHaveBeenCalledWith('+919876543210', '482913');

    expect(await screen.findByRole('heading', { name: 'Almost there' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Full name'), 'Riya Nair');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/offers'));
    expect(api.register).toHaveBeenCalledWith({
      signupToken: 'signup-token',
      fullName: 'Riya Nair',
    });
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'access-1',
    });
    expect(await screen.findByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it('signs existing users straight in after the code', async () => {
    const user = userEvent.setup();
    api.sendOtp.mockResolvedValue({ expiresIn: 300, resendIn: 60 });
    api.verifyOtp.mockResolvedValue({ status: 'AUTHENTICATED', ...session() });
    const { router } = renderRoute('/login');
    await user.type(await screen.findByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: /get otp/i }));
    await user.type(await screen.findByLabelText('One-time code'), '123456');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.register).not.toHaveBeenCalled();
  });

  it('validates the number before calling the API', async () => {
    const user = userEvent.setup();
    renderRoute('/login');
    await user.type(await screen.findByLabelText('Mobile number'), '12345');
    await user.click(screen.getByRole('button', { name: /get otp/i }));
    expect(await screen.findByText('Enter a valid 10-digit mobile number')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toHaveAttribute('aria-invalid', 'true');
    expect(api.sendOtp).not.toHaveBeenCalled();
  });

  it('shows the API message for a wrong code and lets the user retry', async () => {
    const user = userEvent.setup();
    useAuthFlow.getState().startOtp('+919876543210', '/', { resendIn: 60 });
    api.verifyOtp.mockRejectedValueOnce(
      new ApiClientError('Incorrect code. 4 attempts left.', 400, 'INVALID_OTP'),
    );
    renderRoute('/verify-otp');
    await user.type(await screen.findByLabelText('One-time code'), '000000');
    expect(await screen.findByTestId('field-error-otp')).toHaveTextContent(
      'Incorrect code. 4 attempts left.',
    );
    expect(screen.getByLabelText('One-time code')).toHaveValue('');
    expect(screen.getByLabelText('One-time code')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends people who open /verify-otp directly back to login', async () => {
    const { router } = renderRoute('/verify-otp');
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('password login', () => {
  it('signs in with email and password', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(session());
    const { router } = renderRoute('/login?returnTo=/wallet');
    await user.click(await screen.findByRole('radio', { name: 'Email' }));
    await user.type(screen.getByLabelText('Email or mobile number'), 'Amit@Example.com');
    await user.type(screen.getByLabelText('Password'), 'travel2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'));
    expect(api.login).toHaveBeenCalledWith('amit@example.com', 'travel2026');
  });

  it('shows invalid credentials and clears the password', async () => {
    const user = userEvent.setup();
    api.login.mockRejectedValue(
      new ApiClientError('Incorrect mobile number, email or password', 401, 'INVALID_CREDENTIALS'),
    );
    const { router } = renderRoute('/login');
    await user.click(await screen.findByRole('radio', { name: 'Email' }));
    await user.type(screen.getByLabelText('Email or mobile number'), '9876543210');
    await user.type(screen.getByLabelText('Password'), 'wrongpass1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('field-error-password')).toHaveTextContent(
      'Incorrect mobile number, email or password',
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('never redirects off-site after login', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(session());
    const { router } = renderRoute('/login?returnTo=https://evil.example');
    await user.click(await screen.findByRole('radio', { name: 'Email' }));
    await user.type(screen.getByLabelText('Email or mobile number'), '9876543210');
    await user.type(screen.getByLabelText('Password'), 'travel2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('password reset', () => {
  it('sends a code, checks the new password, and returns to login', async () => {
    const user = userEvent.setup();
    api.forgotPassword.mockResolvedValue({ expiresIn: 300, resendIn: 60 });
    api.resetPassword.mockResolvedValue(null);
    const { router } = renderRoute('/forgot-password');

    await user.type(await screen.findByLabelText('Mobile number or email'), 'amit@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset code' }));
    expect(await screen.findByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
    expect(screen.getByText('amit@example.com')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Reset code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'newjourney9');
    await user.type(screen.getByLabelText('Confirm new password'), 'different9');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'), 'newjourney9');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.resetPassword).toHaveBeenCalledWith('amit@example.com', '123456', 'newjourney9');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password updated. Log in with your new password.',
    );
  });
});

describe('SOP feedback', () => {
  it('toasts "Please fix the errors", marks fields and focuses the first one on an empty submit', async () => {
    const user = userEvent.setup();
    renderRoute('/login');
    await user.click(await screen.findByRole('radio', { name: 'Email' }));
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    render(<Toaster />);
    expect(await screen.findByTestId('toast-error')).toHaveTextContent('Please fix the errors');
    expect(screen.getByTestId('field-error-identifier')).toHaveTextContent(
      'Enter your mobile number or email',
    );
    expect(screen.getByTestId('field-error-password')).toHaveTextContent('Password is required');
    expect(screen.getByLabelText('Email or mobile number')).toHaveFocus();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('toasts "Login successful!" and "OTP sent to +91 …"', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(session());
    render(<Toaster />);
    renderRoute('/login');
    await user.click(await screen.findByRole('radio', { name: 'Email' }));
    await user.type(screen.getByLabelText('Email or mobile number'), 'amit@example.com');
    await user.type(screen.getByLabelText('Password'), 'travel2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('toast-success')).toHaveTextContent('Login successful!');
  });

  it('shows the setup message when Google is not configured', async () => {
    const user = userEvent.setup();
    renderRoute('/login');
    await user.click(await screen.findByTestId('auth-google'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Google sign-in isn't set up yet. Please continue with your mobile number or email.",
    );
  });

  it('disables resend until the 30-second cooldown ends', async () => {
    useAuthFlow.getState().startOtp('+919876543210', '/', { resendIn: 30 });
    renderRoute('/verify-otp');
    const resend = await screen.findByTestId('auth-resend');
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent(/Resend OTP in 00:(30|29)/);
  });
});
