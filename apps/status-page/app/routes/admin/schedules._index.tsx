import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Link, useLoaderData } from 'react-router';

import { formatDateTime, formatRelative } from '../../admin/format';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import {
  components as componentsTable,
  scheduleComponents,
  schedules,
} from '../../db/schema';
import type { Route } from './+types/schedules._index';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [inProgress, upcoming, completed] = await Promise.all([
    db
      .select()
      .from(schedules)
      .where(
        and(isNotNull(schedules.startedAt), isNull(schedules.completedAt)),
      )
      .orderBy(asc(schedules.scheduledStart)),
    db
      .select()
      .from(schedules)
      .where(and(isNull(schedules.startedAt), isNull(schedules.completedAt)))
      .orderBy(asc(schedules.scheduledStart)),
    db
      .select()
      .from(schedules)
      .where(isNotNull(schedules.completedAt))
      .orderBy(desc(schedules.completedAt))
      .limit(20),
  ]);

  const all = [...inProgress, ...upcoming, ...completed];
  const allIds = all.map((s) => s.id);
  const links =
    allIds.length > 0
      ? await db
          .select({
            scheduleId: scheduleComponents.scheduleId,
            componentName: componentsTable.name,
          })
          .from(scheduleComponents)
          .innerJoin(
            componentsTable,
            eq(componentsTable.id, scheduleComponents.componentId),
          )
          .where(inArray(scheduleComponents.scheduleId, allIds))
      : [];

  const byId = new Map<number, string[]>();
  for (const l of links) {
    const list = byId.get(l.scheduleId) ?? [];
    list.push(l.componentName);
    byId.set(l.scheduleId, list);
  }

  const enrich = (rows: typeof inProgress) =>
    rows.map((s) => ({ ...s, componentNames: byId.get(s.id) ?? [] }));

  return {
    inProgress: enrich(inProgress),
    upcoming: enrich(upcoming),
    completed: enrich(completed),
  };
}

type Row = {
  id: number;
  title: string;
  description: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  componentNames: string[];
};

export default function SchedulesIndex() {
  const { inProgress, upcoming, completed } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Scheduled maintenance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pre-announce planned maintenance windows. Mark them started when
            the work begins and completed when it finishes.
          </p>
        </div>
        <Link
          to="/admin/schedules/new"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          Schedule maintenance
        </Link>
      </div>

      <Section title="In progress" empty="None right now." rows={inProgress} />
      <Section
        title="Upcoming"
        empty="Nothing scheduled."
        rows={upcoming}
        className="mt-10"
      />
      <Section
        title="Completed"
        empty="None yet."
        rows={completed}
        className="mt-10"
      />
    </div>
  );
}

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
          {rows.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <Link
                to={`/admin/schedules/${s.id}`}
                className="font-medium hover:underline"
              >
                {s.title}
              </Link>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(s.scheduledStart)} →{' '}
                {formatDateTime(s.scheduledEnd)}
                {s.startedAt &&
                  ` · Started ${formatRelative(s.startedAt)}`}
                {s.completedAt &&
                  ` · Completed ${formatRelative(s.completedAt)}`}
                {s.componentNames.length > 0 &&
                  ` · ${s.componentNames.join(', ')}`}
              </p>
              {s.description && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  {s.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
