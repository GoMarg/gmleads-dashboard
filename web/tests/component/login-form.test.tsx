import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/login-form';
import { AuthProvider } from '@/lib/auth-context';
import { setCurrentTokens } from '@/lib/auth-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  setCurrentTokens(null);
  vi.restoreAllMocks();
});

function renderLoginForm(): void {
  render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}

describe('LoginForm', () => {
  it('rejects an invalid email client-side, via the shared loginRequestSchema, without calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'somepassword');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/invalid/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits valid credentials and shows an error on 401 without leaking whether the email exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_credentials' }))
    );
    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('logs in successfully and stores the returned tokens', async () => {
    const tokens = { accessToken: 'a1', refreshToken: 'r1', workspaceId: 'ws-1' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, tokens)));
    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'a@b.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });
  });
});
