import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';

export async function Nav() {
  const session = await auth();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-fuchsia-500" />
          Reelforge
        </Link>
        {session?.user && (
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/generate" className="hover:text-zinc-100">
              Generate
            </Link>
            <Link href="/queue" className="hover:text-zinc-100">
              Queue
            </Link>
            <Link href="/library" className="hover:text-zinc-100">
              Library
            </Link>
            <Link href="/billing" className="hover:text-zinc-100">
              Billing
            </Link>
            {session.user.role === 'admin' && (
              <Link href="/admin" className="text-amber-400/80 hover:text-amber-300">
                Admin
              </Link>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {session?.user ? (
            <>
              <Link href="/account" className="text-zinc-400 hover:text-zinc-100">
                {session.user.email}
              </Link>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/signin"
              className="rounded-md bg-fuchsia-600 px-3 py-1.5 font-medium text-white hover:bg-fuchsia-500"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
