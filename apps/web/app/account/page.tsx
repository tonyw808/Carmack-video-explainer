import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">Account</h1>
      <dl className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm">
        <div>
          <dt className="text-zinc-500">Email</dt>
          <dd className="mt-1 text-zinc-100">{session.user.email}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Role</dt>
          <dd className="mt-1 text-zinc-100">{session.user.role}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">User ID</dt>
          <dd className="mt-1 font-mono text-xs text-zinc-300">{session.user.id}</dd>
        </div>
      </dl>
    </div>
  );
}
