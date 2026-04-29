import { Link } from 'react-router';

export default function AdminOverview() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-400">
        Pick what to manage from the nav above. Components first; incidents,
        scheduled maintenance, and the agents tab arrive in the next PR for
        sub-task 5.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        <li className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Link to="/admin/components" className="font-medium hover:underline">
            Components →
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            Add, edit, and remove monitored components and their probe URLs.
          </p>
        </li>
      </ul>
    </div>
  );
}
