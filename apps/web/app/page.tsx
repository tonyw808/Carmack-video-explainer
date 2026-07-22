import Link from 'next/link';

// Landing page v1 stub — full marketing surface lands in Slice 5.
export default function LandingPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight">
        Type a prompt. <span className="text-fuchsia-500">Get a video.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
        Reelforge turns text into finished, downloadable videos. Buy credits, describe the
        shot, and let the render farm do the rest.
      </p>
      <div className="mt-10">
        <Link
          href="/generate"
          className="rounded-lg bg-fuchsia-600 px-6 py-3 text-lg font-medium text-white hover:bg-fuchsia-500"
        >
          Start generating
        </Link>
      </div>
    </div>
  );
}
