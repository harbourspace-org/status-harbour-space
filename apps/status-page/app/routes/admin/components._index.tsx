import { asc, eq } from 'drizzle-orm';
import { Form, Link, redirect, useLoaderData } from 'react-router';

import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import { componentGroups, components } from '../../db/schema';
import type { Route } from './+types/components._index';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const rows = await db
    .select({
      id: components.id,
      name: components.name,
      slug: components.slug,
      probeUrl: components.probeUrl,
      severityWhenDown: components.severityWhenDown,
      sortOrder: components.sortOrder,
      isExternal: components.isExternal,
      groupName: componentGroups.name,
    })
    .from(components)
    .leftJoin(componentGroups, eq(components.groupId, componentGroups.id))
    .orderBy(asc(components.sortOrder), asc(components.name));
  return { rows };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get('intent') !== 'delete') return null;
  const id = Number(form.get('id'));
  if (!Number.isInteger(id)) return null;
  await db.delete(components).where(eq(components.id, id));
  throw redirect('/admin/components');
}

export default function ComponentsIndex() {
  const { rows } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Components</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each row is a probe target. Sort order controls the public-page
            ordering inside its group.
          </p>
        </div>
        <Link
          to="/admin/components/new"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          Add component
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Group</th>
              <th className="px-4 py-2">Severity</th>
              <th className="px-4 py-2 text-right">Sort</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  No components yet. Run <code>npm run db:seed</code> or add
                  one.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/components/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.isExternal && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800">
                      external
                    </span>
                  )}
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.probeUrl}
                  </p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {c.slug}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  {c.groupName ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.severityWhenDown.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500">
                  {c.sortOrder}
                </td>
                <td className="px-4 py-3 text-right">
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (
                        !confirm(`Delete "${c.name}"? Probes referencing it will be removed too.`)
                      )
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
