export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
          Pharmegic
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Portal v1
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Next.js app is ready for Hostinger GitHub deployment. Edit{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm dark:bg-zinc-900">
            src/app/page.tsx
          </code>{" "}
          to build your portal UI.
        </p>
      </main>
    </div>
  );
}
