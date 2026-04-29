import { desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Link, useLoaderData } from 'react-router';

import { formatDateTime, formatRelative } from '../../admin/format';
import {
  INCIDENT_STATUS_LABEL,
  type IncidentStatusValue,
} from '../../admin/incident-helpers';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import {
  components as componentsTable,
  incidentComponents,
  incidents,
} from '../../db/schema';
import type { Route } from './+types/incidents._index';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [active, resolved] = await Promise.all([
    db
      .select()
      .from(incidents)
      .where(isNull(incidents.resolvedAt))
      .orderBy(desc(incidents.startedAt)),
    db
      .select()
      .from(incidents)
      .where(isNotNull(incidents.resolvedAt))
      .orderBy(desc(incidents.startedAt))
      .limit(20),
  ]);

  const all = [...active, ...resolved];
  const allIds = all.map((i) => i.id);
  const links =
    allIds.length > 0
      ? await db
          .select({
            incidentId: incidentComponents.incidentId,
            componentName: componentsTable.name,
          })
          .from(incidentComponents)
          .innerJoin(
            componentsTable,
            eq(componentsTable.id, incidentComponents.componentId),
          )
          .where(inArray(incidentComponents.incidentId, allIds))
      : [];

  const componentsByIncident = new Map<number, string[]>();
  for (const l of links) {
    const list = componentsByIncident.get(l.incidentId) ?? [];
    list.push(l.componentName);
    componentsByIncident.set(l.incidentId, list);
  }

  const enrich = (
    rows: typeof active,
  ): Array<(typeof active)[number] & { componentNames: string[] }> =>
    rows.map((i) => ({
      ...i,
      componentNames: componentsByIncident.get(i.id) ?? [],
    }));

  return { active: enrich(active), resolved: enrich(resolved) };
}

export default function IncidentsIndex() {
  const { active, resolved } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Incidents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manually-opened incidents only. Auto-incidents from the consensus
            engine arrive in HSDEV-613.
          </p>
        </div>
        <Link
          to="/admin/incidents/new"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          Open incident
        </Link>
      </div>

      <Section
        title="Active"
        empty="No open incidents."
        rows={active}
      />

      <Section
        title="Recently resolved"
        empty="None yet."
        rows={resolved}
        className="mt-10"
      />
    </div>
  );
}

type Row = {
  id: number;
  title: string;
  currentStatus: string;
  severity: string;
  isAutoCreated: boolean;
  startedAt: Date;
  resolvedAt: Date | null;
  componentNames: string[];
};

function Section({
  title,
  empty,
  rows,
  className,
}: {
  title: string;
  empty: string;
  rows: Row[];
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {rows.map((i) => (
            <li key={i.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/admin/incidents/${i.id}`}
                    className="font-medium hover:underline"
                  >
                    {i.title}
                  </Link>
                  {i.isAutoCreated && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800">
                      auto
                    </span>
                  )}
                  <p className="mt-0.5 text-xs text-slate-500">
                    Started {formatDateTime(i.startedAt)} ·{' '}
                    {formatRelative(i.startedAt)}
                    {i.resolvedAt &&
                      ` · Resolved ${formatRelative(i.resolvedAt)}`}
                    {i.componentNames.length > 0 &&
                      ` · ${i.componentNames.join(', ')}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
                  {INCIDENT_STATUS_LABEL[
                    i.currentStatus as IncidentStatusValue
                  ] ?? i.currentStatus}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
