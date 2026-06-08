import {
  Form,
  Link,
  NavLink,
  Outlet,
  redirect,
  useLoaderData,
} from 'react-router';

import { getSession } from '../auth.server';
import type { Route } from './+types/admin';

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  const email = session?.user?.email ?? null;

  if (!email) {
    const path = new URL(request.url).pathname;
    const params = new URLSearchParams({ callbackUrl: path });
    throw redirect(`/api/auth/signin/keycloak?${params.toString()}`);
  }

  return { email };
}

export function meta() {
  return [{ title: 'Admin — Harbour.Space Status' }];
}

export default function AdminLayout() {
  const { email } = useLoaderData<typeof loader>();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/admin" className="text-sm font-semibold">
            Status Admin
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">{email}</span>
            <Form method="post" action="/api/auth/signout">
              <input type="hidden" name="callbackUrl" value="/" />
              <button type="submit" className="text-slate-500 underline">
                Sign out
              </button>
            </Form>
          </div>
        </div>
        <nav className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex max-w-5xl gap-6 px-6 text-sm">
            <NavTab to="/admin" end label="Overview" />
            <NavTab to="/admin/components" label="Components" />
            <NavTab to="/admin/incidents" label="Incidents" />
            <NavTab to="/admin/schedules" label="Maintenance" />
            <NavTab to="/admin/agents" label="Agents" />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavTab({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `border-b-2 px-1 py-2 ${
          isActive
            ? 'border-slate-900 font-medium text-slate-900 dark:border-slate-100 dark:text-slate-100'
            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
