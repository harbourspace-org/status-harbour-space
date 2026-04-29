import { Link } from 'react-router';

export default function AdminOverview() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-400">
        Pick what to manage from the nav above.
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
        <li className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Link to="/admin/incidents" className="font-medium hover:underline">
            Incidents →
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            Open, update, and resolve manually-tracked incidents.
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Link to="/admin/schedules" className="font-medium hover:underline">
            Maintenance →
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            Pre-announce maintenance windows; mark them started and completed.
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Link to="/admin/agents" className="font-medium hover:underline">
            Agents →
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            See which uptime-monitor instances are reporting and their last
            probe per component.
          </p>
        </li>
      </ul>
    </div>
  );
}
