import { asc } from 'drizzle-orm';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from 'react-router';

import { parseDatetimeLocal } from '../../admin/format';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import {
  components as componentsTable,
  scheduleComponents,
  schedules,
} from '../../db/schema';
import type { Route } from './+types/schedules.new';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const components = await db
    .select({ id: componentsTable.id, name: componentsTable.name })
    .from(componentsTable)
    .orderBy(asc(componentsTable.sortOrder), asc(componentsTable.name));
  return { components };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) values[k] = String(v);

  const title = String(form.get('title') ?? '').trim();
  if (!title) errors.title = 'Required';
  else if (title.length > 200) errors.title = 'Max 200 chars';

  const description = String(form.get('description') ?? '').trim();

  const start = parseDatetimeLocal(String(form.get('scheduledStart') ?? ''));
  if (!start) errors.scheduledStart = 'Pick a start time';
  const end = parseDatetimeLocal(String(form.get('scheduledEnd') ?? ''));
  if (!end) errors.scheduledEnd = 'Pick an end time';
  if (start && end && end <= start)
    errors.scheduledEnd = 'End must be after start';

  const componentIds = form
    .getAll('componentIds')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  if (Object.keys(errors).length > 0) return { errors, values };

  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schedules)
      .values({
        title,
        description: description || null,
        scheduledStart: start!,
        scheduledEnd: end!,
      })
      .returning({ id: schedules.id });
    if (componentIds.length > 0) {
      await tx.insert(scheduleComponents).values(
        componentIds.map((componentId) => ({
          scheduleId: created.id,
          componentId,
        })),
      );
    }
    return created.id;
  });

  throw redirect(`/admin/schedules/${newId}`);
}

export default function NewSchedule() {
  const { components } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const errors = data?.errors ?? {};
  const values = data?.values ?? {};

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          to="/admin/schedules"
          className="text-xs text-slate-500 underline"
        >
          ← Back to schedules
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Schedule maintenance</h1>
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
          <Field label="Scheduled start" error={errors.scheduledStart}>
            <input
              type="datetime-local"
              name="scheduledStart"
              required
              defaultValue={values.scheduledStart ?? ''}
              className={inputClass}
            />
          </Field>
          <Field label="Scheduled end" error={errors.scheduledEnd}>
            <input
              type="datetime-local"
              name="scheduledEnd"
              required
              defaultValue={values.scheduledEnd ?? ''}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Affected components" hint="Optional but recommended.">
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

        <Field label="Description" hint="Optional. Shown on the public page.">
          <textarea
            name="description"
            rows={3}
            defaultValue={values.description ?? ''}
            className={inputClass}
          />
        </Field>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            Schedule
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
