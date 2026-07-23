import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import type { EmailConfig } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@reelforge/db';
import { envInt } from '@reelforge/core/env';
import { recordMagicLink } from './dev-magic-link';

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().has(email.toLowerCase());
}

// Magic-link provider. With EMAIL_SERVER configured this would hand off to SMTP;
// the dev profile logs the link and records it for the dev-only retrieval endpoint.
const emailProvider = {
  id: 'email',
  type: 'email',
  name: 'Email magic link',
  from: process.env.EMAIL_FROM ?? 'Reelforge <signin@reelforge.local>',
  maxAge: 24 * 60 * 60,
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    // Production SMTP delivery is wired in the deploy runbook (README). The dev
    // profile intentionally has zero external dependencies.
    console.log(`\n[reelforge] Magic sign-in link for ${identifier}:\n  ${url}\n`);
    recordMagicLink(identifier, url);
  },
} satisfies EmailConfig;

const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

const providers: NextAuthConfig['providers'] = [emailProvider];
if (googleEnabled) providers.push(Google);

export function isGoogleEnabled(): boolean {
  return googleEnabled;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  trustHost: true,
  pages: {
    signIn: '/signin',
    verifyRequest: '/check-email',
    error: '/signin',
  },
  providers,
  callbacks: {
    async session({ session, user }) {
      const dbRole = (user as { role?: string }).role;
      session.user.id = user.id;
      session.user.role = dbRole === 'admin' || isAdminEmail(user.email) ? 'admin' : 'user';
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      if (user.email && isAdminEmail(user.email)) {
        await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
      }
      const bonus = envInt('SIGNUP_BONUS_CREDITS', 0);
      if (bonus > 0) {
        await prisma.creditLedgerEntry.create({
          data: {
            userId: user.id,
            delta: bonus,
            reason: 'signup_bonus',
            reference: user.id,
            note: 'Welcome bonus',
          },
        });
      }
    },
  },
});
