export default function CheckEmailPage() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="mt-3 text-zinc-400">
        A sign-in link has been sent to your address. Open it on this device to finish
        signing in.
      </p>
      <p className="mt-4 text-xs text-zinc-500">
        Dev profile: the link was printed to the server console (and is available at
        <code className="ml-1 rounded bg-zinc-800 px-1 py-0.5">/api/dev/magic-link?email=…</code>).
      </p>
    </div>
  );
}
