// Auth guards for routes and server actions.
import { redirect } from 'next/navigation';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

/** For pages/actions: returns the user or redirects to sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    role: session.user.role,
  };
}

/** For pages/actions: returns the user or redirects; additionally requires admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/');
  return user;
}

/** For API routes: returns the user or null (caller returns 401). */
export async function getApiUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    role: session.user.role,
  };
}
