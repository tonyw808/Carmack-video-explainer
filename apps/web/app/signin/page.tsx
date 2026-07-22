import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { isGoogleEnabled, signIn } from '@/lib/auth';

async function emailSignIn(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    redirect('/signin?error=EmailRequired');
  }
  try {
    await signIn('email', { email, redirectTo: '/account' });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/signin?error=${encodeURIComponent(error.type)}`);
    }
    throw error; // NEXT_REDIRECT and friends must propagate
  }
}

async function googleSignIn() {
  'use server';
  try {
    await signIn('google', { redirectTo: '/account' });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/signin?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  EmailRequired: 'Enter a valid email address.',
  Verification: 'That sign-in link is invalid or expired. Request a new one.',
  AccessDenied: 'Access denied for this account.',
  Configuration: 'Auth is misconfigured. Check server logs.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-8">
      <h1 className="text-2xl font-semibold">Sign in to Reelforge</h1>
      <p className="mt-2 text-sm text-zinc-400">
        New here? Signing in creates your account automatically.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {ERROR_MESSAGES[error] ?? 'Sign-in failed. Try again.'}
        </div>
      )}

      <form action={emailSignIn} className="mt-6 space-y-3">
        <label className="block text-sm text-zinc-300" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-fuchsia-500"
        />
        <button className="w-full rounded-md bg-fuchsia-600 px-3 py-2 font-medium text-white hover:bg-fuchsia-500">
          Email me a magic link
        </button>
      </form>

      <p className="mt-3 text-xs text-zinc-500">
        Dev profile: the link is printed to the server console instead of emailed.
      </p>

      {isGoogleEnabled() && (
        <form action={googleSignIn} className="mt-6 border-t border-zinc-800 pt-6">
          <button className="w-full rounded-md border border-zinc-700 px-3 py-2 font-medium text-zinc-200 hover:bg-zinc-800">
            Continue with Google
          </button>
        </form>
      )}
    </div>
  );
}
