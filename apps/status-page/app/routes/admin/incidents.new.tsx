import { asc } from 'drizzle-orm';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from 'react-router';

import { SEVERITY_OPTIONS } from '../../admin/component-form';
import {
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
import type { Route } from './+types/incidents.new';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const components = await db
    .select({ id: componentsTable.id, name: componentsTable.name })
    .from(componentsTable)
    .orderBy(asc(componentsTable.sortOrder), asc(componentsTable.name));
  return { components };
}

export async function action({ request }: Route.ActionArgs) {
  const email = await requireAdmin(request);
  const form = await request.formData();
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) values[k] = String(v);

  const title = String(form.get('title') ?? '').trim();
  if (!title) errors.title = 'Required';
  else if (title.length > 200) errors.title = 'Max 200 chars';

  const severity = String(form.get('severity') ?? '');
  if (!SEVERITY_OPTIONS.some((o) => o.value === severity))
    errors.severity = 'Pick a severity';

  const initialStatus = String(form.get('status') ?? 'investigating');
  if (!isIncidentStatus(initialStatus))
    errors.status = 'Pick a status';

  const message = String(form.get('message') ?? '').trim();
  if (!message) errors.message = 'Required — say something the public will see';

  const componentIds = form
    .getAll('componentIds')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  if (Object.keys(errors).length > 0) return { errors, values };

  const status = initialStatus as IncidentStatusValue;
  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(incidents)
      .values({
        title,
        severity: severity as 'performance_issues' | 'partial_outage' | 'major_outage' | 'under_maintenance',
        currentStatus: status,
        isAutoCreated: false,
        resolvedAt: status === 'resolved' ? new Date() : null,
      })
      .returning({ id: incidents.id });

    if (componentIds.length > 0) {
      await tx
        .insert(incidentComponents)
        .values(
          componentIds.map((componentId) => ({
            incidentId: created.id,
            componentId,
          })),
        );
    }

    await tx.insert(incidentUpdates).values({
      incidentId: created.id,
      status,
      message,
      postedBy: email,
    });

    return created.id;
  });

  throw redirect(`/admin/incidents/${newId}`);
}

export default function NewIncident() {
  const { components } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const errors = data?.errors ?? {};
  const values = data?.values ?? {};

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          to="/admin/incidents"
          className="text-xs text-slate-500 underline"
        >
          ← Back to incidents
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Open incident</h1>
      </div>
      <Form method="post" className="space-y-5">
        <Field label="Title" error={errors.title}>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={values.title ?? ''}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Severity" error={errors.severity}>
            <select
              name="severity"
              defaultValue={values.severity ?? 'partial_outage'}
              className={inputClass}
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Initial status" error={errors.status}>
            <select
              name="status"
              defaultValue={values.status ?? 'investigating'}
              className={inputClass}
            >
              {INCIDENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Affected components"
          hint="Optional. The incident will appear next to these components on the public page."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {components.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm font-normal"
              >
                <input type="checkbox" name="componentIds" value={c.id} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Initial update message" error={errors.message}>
          <textarea
            name="message"
            rows={4}
            required
            defaultValue={values.message ?? ''}
            className={inputClass}
          />
        </Field>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            Open incident
          </button>
        </div>
      </Form>
    </div>
  );
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      )}
    </label>
  );
}
