export function meta() {
  return [{ title: 'Admin — Harbour.Space Status' }];
}

export default function Admin() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-4 text-slate-600 dark:text-slate-400">
        Sign-in, components CRUD, incident management and the agents tab arrive
        in HSDEV-612 sub-task 5.
      </p>
    </main>
  );
}
