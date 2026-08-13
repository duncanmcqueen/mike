import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import MikeLogo from "./MikeLogo";

export default function Login() {
  const { status, login, verifyMfa, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const needsMfa = status?.mfaRequired === true;

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    try {
      await verifyMfa(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-5">
      <div className="mb-6 text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center text-gray-900">
          <MikeLogo size={56} />
        </div>
        <h1 className="font-serif text-xl text-gray-900">Mike AI</h1>
        <p className="mt-1 text-xs text-gray-500">
          {needsMfa
            ? `Verify ${status.user?.email ?? "your account"}`
            : "Sign in with your MikeOSS account"}
        </p>
      </div>

      {needsMfa ? (
        <form onSubmit={handleMfa} className="w-full max-w-xs space-y-3">
          <div>
            <label htmlFor="mfa-code" className="mb-1 block text-xs font-medium text-gray-700">
              Authenticator code
            </label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              placeholder="000000"
            />
          </div>
          {error ? <ErrorMessage text={error} /> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-950 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full py-1 text-xs text-gray-500 hover:text-gray-900"
          >
            Use another account
          </button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
          </div>
          {error ? <ErrorMessage text={error} /> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-950 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {text}
    </p>
  );
}
