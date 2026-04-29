export function meta() {
  return [
    { title: 'Harbour.Space — Status' },
    {
      name: 'description',
      content: 'Real-time service status for harbour.space and related products.',
    },
  ];
}

export default function Index() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
        />
        Harbour.Space Status
      </h1>
      <p className="mt-4 text-slate-600 dark:text-slate-400">
        Real-time monitoring is being wired up. Component-level status will
        appear here as the multi-zone uptime agents come online.
      </p>
      <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
        status.harbour.space
      </p>
    </main>
  );
}
