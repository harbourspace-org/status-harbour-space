import { asc, desc, eq } from 'drizzle-orm';
import {
  Form,
  Link,
  redirect,
  useLoaderData,
} from 'react-router';

import { SEVERITY_OPTIONS } from '../../admin/component-form';
import { formatDateTime, formatRelative } from '../../admin/format';
import {
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_OPTIONS,
  type IncidentStatusValue,
  isIncidentStatus,
} from '../../admin/incident-helpers';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import {
  components as componentsTable,
  incidentComponents,
  incidentUpdates,
  incidents,
} from '../../db/schema';
import { notifyIncident } from '../../notifications.server';
import type { Route } from './+types/incidents.$id';

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response('Not found', { status: 404 });

  const [incidentRows, allComponents] = await Promise.all([
    db.select().from(incidents).where(eq(incidents.id, id)).limit(1),
    db
      .select({ id: componentsTable.id, name: componentsTable.name })
      .from(componentsTable)
      .orderBy(asc(componentsTable.sortOrder), asc(componentsTable.name)),
  ]);

  if (incidentRows.length === 0)
    throw new Response('Not found', { status: 404 });

  const [linkedRows, updates] = await Promise.all([
    db
      .select({ componentId: incidentComponents.componentId })
      .from(incidentComponents)
      .where(eq(incidentComponents.incidentId, id)),
    db
      .select()
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, id))
      .orderBy(desc(incidentUpdates.postedAt)),
  ]);

  return {
    incident: incidentRows[0],
    allComponents,
    linkedComponentIds: linkedRows.map((r) => r.componentId),
    updates,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const email = await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response('Not found', { status: 404 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'delete') {
    await db.delete(incidents).where(eq(incidents.id, id));
    throw redirect('/admin/incidents');
  }

  if (intent === 'update_metadata') {
    const title = String(form.get('title') ?? '').trim();
    const severity = String(form.get('severity') ?? '');
    if (!title || title.length > 200) return null;
    if (!SEVERITY_OPTIONS.some((o) => o.value === severity)) return null;
    await db
      .update(incidents)
      .set({
        title,
        severity: severity as
          | 'performance_issues'
          | 'partial_outage'
          | 'major_outage'
          | 'under_maintenance',
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, id));
    throw redirect(`/admin/incidents/${id}`);
  }

  if (intent === 'update_components') {
    const componentIds = form
      .getAll('componentIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));
    await db.transaction(async (tx) => {
      await tx
        .delete(incidentComponents)
        .where(eq(incidentComponents.incidentId, id));
      if (componentIds.length > 0) {
        await tx.insert(incidentComponents).values(
          componentIds.map((componentId) => ({
            incidentId: id,
            componentId,
          })),
        );
      }
    });
    throw redirect(`/admin/incidents/${id}`);
  }

  if (intent === 'post_update') {
    const status = String(form.get('status') ?? '');
    const message = String(form.get('message') ?? '').trim();
    if (!isIncidentStatus(status) || !message) return null;
    await db.transaction(async (tx) => {
      await tx.insert(incidentUpdates).values({
        incidentId: id,
        status,
        message,
        postedBy: email,
      });
      await tx
        .update(incidents)
        .set({
          currentStatus: status,
          resolvedAt: status === 'resolved' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(incidents.id, id));
    });

    const [incidentRow] = await db
      .select({ title: incidents.title, severity: incidents.severity })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (incidentRow) {
      const linkedRows = await db
        .select({ name: componentsTable.name })
        .from(incidentComponents)
        .innerJoin(
          componentsTable,
          eq(incidentComponents.componentId, componentsTable.id),
        )
        .where(eq(incidentComponents.incidentId, id));
      await notifyIncident({
        kind: 'update',
        incidentId: id,
        title: incidentRow.title,
        severity: incidentRow.severity,
        status,
        message,
        componentNames: linkedRows.map((r) => r.name),
      });
    }

    throw redirect(`/admin/incidents/${id}`);
  }

  return null;
}

export default function EditIncident() {
  const { incident, allComponents, linkedComponentIds, updates } =
    useLoaderData<typeof loader>();
  const linkedSet = new Set(linkedComponentIds);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Link
            to="/admin/incidents"
            className="text-xs text-slate-500 underline"
          >
            ← Back to incidents
          </Link>
          <h1 className="mt-2 text-xl font-semibold">{incident.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            Status:{' '}
            {INCIDENT_STATUS_LABEL[
              incident.currentStatus as IncidentStatusValue
            ] ?? incident.currentStatus}{' '}
            · Severity: {incident.severity.replace(/_/g, ' ')} · Started{' '}
            {formatRelative(incident.startedAt)}
            {incident.resolvedAt &&
              ` · Resolved ${formatRelative(incident.resolvedAt)}`}
          </p>
        </div>
        <Form
          method="post"
          onSubmit={(e) => {
            if (
              !confirm(
                `Delete "${incident.title}"? Updates and component links go too.`,
              )
            )
              e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <button
            type="submit"
            className="text-sm text-rose-600 hover:underline"
          >
            Delete
          </button>
        </Form>
      </div>

      <Section title="Metadata">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_metadata" />
          <Field label="Title">
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={incident.title}
              className={inputClass}
            />
          </Field>
          <Field label="Severity">
            <select
              name="severity"
              defaultValue={incident.severity}
              className={inputClass}
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end">
            <button type="submit" className={primaryBtn}>
              Save metadata
            </button>
          </div>
        </Form>
      </Section>

      <Section title="Affected components">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_components" />
          <div className="grid gap-2 sm:grid-cols-2">
            {allComponents.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm font-normal"
              >
                <input
                  type="checkbox"
                  name="componentIds"
                  value={c.id}
                  defaultChecked={linkedSet.has(c.id)}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" className={primaryBtn}>
              Save components
            </button>
          </div>
        </Form>
      </Section>

      <Section title="Post update">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="post_update" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status">
              <select
                name="status"
                defaultValue={incident.currentStatus}
                className={inputClass}
              >
                {INCIDENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Message">
                <textarea
                  name="message"
                  rows={3}
                  required
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={primaryBtn}>
              Post update
            </button>
          </div>
        </Form>
      </Section>

      <Section title={`Timeline (${updates.length})`}>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
            {updates.map((u) => (
              <li key={u.id}>
                <p className="text-xs font-medium text-slate-500">
                  {INCIDENT_STATUS_LABEL[u.status as IncidentStatusValue] ??
                    u.status}{' '}
                  · {formatDateTime(u.postedAt)}
                  {u.postedBy ? ` · ${u.postedBy}` : ''}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {u.message}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';

const primaryBtn =
  'rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}
