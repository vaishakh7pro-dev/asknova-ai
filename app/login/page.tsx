
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.session) {
          router.push("/");
        } else {
          setMessage(
            "Account created! Check your email to confirm your account, then log in."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push("/");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101114] px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191a20] p-8 shadow-xl">
        <h1 className="mb-2 text-center text-3xl font-bold">
          <span className="text-violet-400">✳</span> AskNova AI
        </h1>

        <p className="mb-8 text-center text-gray-400">
          {isSignup
            ? "Create your account"
            : "Welcome back"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-gray-300">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-300">
              Password (at least 6 characters)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 outline-none focus:border-violet-400"
            />
          </div>

          {message && (
            <p role="status" className="text-sm text-violet-300">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : isSignup
                ? "Create account"
                : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          {isSignup
            ? "Already have an account?"
            : "New to AskNova AI?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setMessage("");
            }}
            className="font-medium text-violet-300 hover:text-violet-200"
          >
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
      </div>
    </main>
  );
}
