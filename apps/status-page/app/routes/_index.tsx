import { and, asc, desc, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { useLoaderData } from 'react-router';

import { db } from '../db/client';
import {
  componentGroups,
  components,
  incidentComponents,
  incidentUpdates,
  incidents,
  scheduleComponents,
  schedules,
} from '../db/schema';
import {
  type DerivedStatus,
  compute90DayUptime,
  computeComponentStatuses,
  getMonitoringHealth,
  worstStatus,
} from '../db/status';

export function meta() {
  return [
    { title: 'Harbour.Space — Status' },
    {
      name: 'description',
      content:
        'Real-time service status for harbour.space and related products.',
    },
  ];
}

export async function loader() {
  const [
    groupRows,
    componentRows,
    monitoring,
    incidentRows,
    scheduleRows,
  ] = await Promise.all([
    db
      .select()
      .from(componentGroups)
      .orderBy(asc(componentGroups.sortOrder), asc(componentGroups.name)),
    db
      .select()
      .from(components)
      .orderBy(asc(components.sortOrder), asc(components.name)),
    getMonitoringHealth(),
    db
      .select()
      .from(incidents)
      .where(
        or(
          isNull(incidents.resolvedAt),
          gte(
            incidents.startedAt,
            sql`NOW() - INTERVAL '30 days'`,
          ),
        ),
      )
      .orderBy(desc(incidents.startedAt))
      .limit(10),
    db
      .select()
      .from(schedules)
      .where(
        and(
          isNull(schedules.completedAt),
          or(
            gte(schedules.scheduledStart, sql`NOW() - INTERVAL '1 day'`),
            gte(schedules.scheduledEnd, sql`NOW()`),
          ),
        ),
      )
      .orderBy(asc(schedules.scheduledStart)),
  ]);

  const componentMetas = componentRows.map((c) => ({
    componentId: c.id,
    severityWhenDown: c.severityWhenDown as Exclude<
      DerivedStatus,
      'operational' | 'no_data'
    >,
  }));

  const [statusMap, uptimeMap, updateRows, incidentComponentLinks, scheduleComponentLinks] =
    await Promise.all([
      computeComponentStatuses(componentMetas),
      compute90DayUptime(),
      incidentRows.length > 0
        ? db
            .select()
            .from(incidentUpdates)
            .where(
              inArray(
                incidentUpdates.incidentId,
                incidentRows.map((i) => i.id),
              ),
            )
            .orderBy(desc(incidentUpdates.postedAt))
        : Promise.resolve([]),
      incidentRows.length > 0
        ? db
            .select()
            .from(incidentComponents)
            .where(
              inArray(
                incidentComponents.incidentId,
                incidentRows.map((i) => i.id),
              ),
            )
        : Promise.resolve([]),
      scheduleRows.length > 0
        ? db
            .select()
            .from(scheduleComponents)
            .where(
              inArray(
                scheduleComponents.scheduleId,
                scheduleRows.map((s) => s.id),
              ),
            )
        : Promise.resolve([]),
    ]);

  const componentNameById = new Map(
    componentRows.map((c) => [c.id, c.name] as const),
  );

  const incidentEntries = incidentRows.map((i) => ({
    id: i.id,
    title: i.title,
    currentStatus: i.currentStatus,
    severity: i.severity,
    isAutoCreated: i.isAutoCreated,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    componentNames: incidentComponentLinks
      .filter((l) => l.incidentId === i.id)
      .map((l) => componentNameById.get(l.componentId))
      .filter((n): n is string => Boolean(n)),
    updates: updateRows
      .filter((u) => u.incidentId === i.id)
      .map((u) => ({
        id: u.id,
        status: u.status,
        message: u.message,
        postedAt: u.postedAt.toISOString(),
      })),
  }));

  const scheduleEntries = scheduleRows.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    scheduledStart: s.scheduledStart.toISOString(),
    scheduledEnd: s.scheduledEnd.toISOString(),
    inProgress: s.startedAt !== null && s.completedAt === null,
    componentNames: scheduleComponentLinks
      .filter((l) => l.scheduleId === s.id)
      .map((l) => componentNameById.get(l.componentId))
      .filter((n): n is string => Boolean(n)),
  }));

  const groupEntries = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    components: componentRows
      .filter((c) => c.groupId === g.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        status: statusMap.get(c.id) ?? ('no_data' as DerivedStatus),
        uptime90: uptimeMap.get(c.id) ?? null,
      })),
  }));

  const ungrouped = componentRows
    .filter((c) => c.groupId === null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      status: statusMap.get(c.id) ?? ('no_data' as DerivedStatus),
      uptime90: uptimeMap.get(c.id) ?? null,
    }));

  const overall = worstStatus(statusMap.values());

  return {
    monitoring,
    overall,
    groups: groupEntries,
    ungrouped,
    incidents: incidentEntries,
    schedules: scheduleEntries,
    generatedAt: new Date().toISOString(),
  };
}

const STATUS_LABEL: Record<DerivedStatus, string> = {
  operational: 'Operational',
  performance_issues: 'Performance issues',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  under_maintenance: 'Under maintenance',
  no_data: 'No data',
};

const STATUS_DOT: Record<DerivedStatus, string> = {
  operational: 'bg-emerald-500',
  performance_issues: 'bg-amber-500',
  partial_outage: 'bg-orange-500',
  major_outage: 'bg-rose-500',
  under_maintenance: 'bg-sky-500',
  no_data: 'bg-slate-400',
};

const STATUS_BAR: Record<DerivedStatus, string> = {
  operational: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  performance_issues: 'bg-amber-50 text-amber-900 border-amber-200',
  partial_outage: 'bg-orange-50 text-orange-900 border-orange-200',
  major_outage: 'bg-rose-50 text-rose-900 border-rose-200',
  under_maintenance: 'bg-sky-50 text-sky-900 border-sky-200',
  no_data: 'bg-slate-50 text-slate-700 border-slate-200',
};

const OVERALL_HEADLINE: Record<DerivedStatus, string> = {
  operational: 'All systems operational',
  performance_issues: 'Some services are seeing performance issues',
  partial_outage: 'Partial outage in progress',
  major_outage: 'Major outage in progress',
  under_maintenance: 'Maintenance in progress',
  no_data: 'Awaiting first probe data',
};

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

function StatusDot({ status }: { status: DerivedStatus }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`}
    />
  );
}

function MonitoringBanner({
  monitoring,
}: {
  monitoring: { health: 'online' | 'stale' | 'never'; lastSeenAt: Date | null };
}) {
  if (monitoring.health === 'online') return null;
  const label =
    monitoring.health === 'never'
      ? 'Monitoring agents have not started reporting yet. Component statuses below are placeholders until the first heartbeat arrives.'
      : `Monitoring is offline — last agent heartbeat ${formatRelative(
          monitoring.lastSeenAt,
        )}. Component statuses are not being updated until contact is restored.`;
  const tone =
    monitoring.health === 'never'
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-rose-200 bg-rose-50 text-rose-900';
  return (
    <div
      role="status"
      className={`mb-6 rounded-lg border px-4 py-3 text-sm ${tone}`}
    >
      {label}
    </div>
  );
}

function formatRelative(date: Date | string | null): string {
  if (!date) return 'never';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUptime(value: number | null): string {
  if (value === null) return '—';
  const pct = value * 100;
  if (pct >= 99.99) return '99.99%';
  return `${pct.toFixed(2)}%`;
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const activeIncidents = data.incidents.filter(
    (i) => i.currentStatus !== 'resolved',
  );
  const recentIncidents = data.incidents.filter(
    (i) => i.currentStatus === 'resolved',
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          Harbour.Space Status
        </h1>
        <span className="text-xs text-slate-400">status.harbour.space</span>
      </header>

      <MonitoringBanner monitoring={data.monitoring} />

      <section
        className={`mb-8 rounded-xl border px-5 py-4 ${STATUS_BAR[data.overall]}`}
      >
        <div className="flex items-center gap-3">
          <StatusDot status={data.overall} />
          <p className="text-base font-medium">
            {OVERALL_HEADLINE[data.overall]}
          </p>
        </div>
      </section>

      {activeIncidents.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Active incidents
          </h2>
          <ul className="space-y-3">
            {activeIncidents.map((i) => (
              <IncidentCard key={i.id} incident={i} />
            ))}
          </ul>
        </section>
      )}

      {data.schedules.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Scheduled maintenance
          </h2>
          <ul className="space-y-3">
            {data.schedules.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{s.title}</p>
                  {s.inProgress && (
                    <span className="rounded-full bg-sky-200 px-2 py-0.5 text-xs font-medium text-sky-900">
                      In progress
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {formatDate(s.scheduledStart)} → {formatDate(s.scheduledEnd)}
                </p>
                {s.componentNames.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Affects: {s.componentNames.join(', ')}
                  </p>
                )}
                {s.description && (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    {s.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Components
        </h2>
        <div className="space-y-6">
          {data.groups.map((g) =>
            g.components.length === 0 ? null : (
              <ComponentGroup key={g.id} name={g.name} components={g.components} />
            ),
          )}
          {data.ungrouped.length > 0 && (
            <ComponentGroup name="Other" components={data.ungrouped} />
          )}
        </div>
      </section>

      {recentIncidents.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent incidents
          </h2>
          <ul className="space-y-3">
            {recentIncidents.map((i) => (
              <IncidentCard key={i.id} incident={i} />
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-12 text-xs text-slate-400">
        Updated {formatRelative(data.generatedAt)} · Multi-zone consensus
        monitoring
      </footer>
    </main>
  );
}

function ComponentGroup({
  name,
  components: list,
}: {
  name: string;
  components: Array<{
    id: number;
    name: string;
    description: string | null;
    status: DerivedStatus;
    uptime90: number | null;
  }>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-base font-semibold">{name}</h3>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {list.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusDot status={c.status} />
                <span className="truncate font-medium">{c.name}</span>
              </div>
              {c.description && (
                <p className="ml-4.5 mt-0.5 truncate text-xs text-slate-500">
                  {c.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs">
              <span className="hidden text-slate-400 sm:inline">
                90d {formatUptime(c.uptime90)}
              </span>
              <span className="text-slate-700 dark:text-slate-300">
                {STATUS_LABEL[c.status]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type IncidentEntry = {
  id: number;
  title: string;
  currentStatus: string;
  severity: string;
  isAutoCreated: boolean;
  startedAt: string;
  resolvedAt: string | null;
  componentNames: string[];
  updates: Array<{
    id: number;
    status: string;
    message: string;
    postedAt: string;
  }>;
};

function IncidentCard({ incident }: { incident: IncidentEntry }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{incident.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Started {formatDate(incident.startedAt)}
            {incident.resolvedAt &&
              ` · Resolved ${formatDate(incident.resolvedAt)}`}
            {incident.componentNames.length > 0 &&
              ` · ${incident.componentNames.join(', ')}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
          {INCIDENT_STATUS_LABEL[incident.currentStatus] ??
            incident.currentStatus}
        </span>
      </div>
      {incident.updates.length > 0 && (
        <ol className="mt-3 space-y-2 border-l border-slate-200 pl-3 dark:border-slate-700">
          {incident.updates.map((u) => (
            <li key={u.id} className="text-sm">
              <p className="text-xs font-medium text-slate-500">
                {INCIDENT_STATUS_LABEL[u.status] ?? u.status} ·{' '}
                {formatDate(u.postedAt)}
              </p>
              <p className="text-slate-700 dark:text-slate-300">{u.message}</p>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
