import { asc, eq } from 'drizzle-orm';
import {
  Form,
  Link,
  redirect,
  useLoaderData,
} from 'react-router';

import {
  formatDateTime,
  formatRelative,
  parseDatetimeLocal,
  toDatetimeLocalValue,
} from '../../admin/format';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import {
  components as componentsTable,
  scheduleComponents,
  schedules,
} from '../../db/schema';
import type { Route } from './+types/schedules.$id';

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response('Not found', { status: 404 });

  const [scheduleRows, allComponents] = await Promise.all([
    db.select().from(schedules).where(eq(schedules.id, id)).limit(1),
    db
      .select({ id: componentsTable.id, name: componentsTable.name })
      .from(componentsTable)
      .orderBy(asc(componentsTable.sortOrder), asc(componentsTable.name)),
  ]);

  if (scheduleRows.length === 0)
    throw new Response('Not found', { status: 404 });

  const linkedRows = await db
    .select({ componentId: scheduleComponents.componentId })
    .from(scheduleComponents)
    .where(eq(scheduleComponents.scheduleId, id));

  return {
    schedule: scheduleRows[0],
    allComponents,
    linkedComponentIds: linkedRows.map((r) => r.componentId),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response('Not found', { status: 404 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'delete') {
    await db.delete(schedules).where(eq(schedules.id, id));
    throw redirect('/admin/schedules');
  }

  if (intent === 'mark_started') {
    await db
      .update(schedules)
      .set({ startedAt: new Date() })
      .where(eq(schedules.id, id));
    throw redirect(`/admin/schedules/${id}`);
  }

  if (intent === 'mark_completed') {
    await db
      .update(schedules)
      .set({ completedAt: new Date() })
      .where(eq(schedules.id, id));
    throw redirect(`/admin/schedules/${id}`);
  }

  if (intent === 'update_metadata') {
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const start = parseDatetimeLocal(
      String(form.get('scheduledStart') ?? ''),
    );
    const end = parseDatetimeLocal(String(form.get('scheduledEnd') ?? ''));
    if (!title || !start || !end || end <= start) return null;

    await db
      .update(schedules)
      .set({
        title,
        description: description || null,
        scheduledStart: start,
        scheduledEnd: end,
      })
      .where(eq(schedules.id, id));
    throw redirect(`/admin/schedules/${id}`);
  }

  if (intent === 'update_components') {
    const componentIds = form
      .getAll('componentIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n));
    await db.transaction(async (tx) => {
      await tx
        .delete(scheduleComponents)
        .where(eq(scheduleComponents.scheduleId, id));
      if (componentIds.length > 0) {
        await tx.insert(scheduleComponents).values(
          componentIds.map((componentId) => ({
            scheduleId: id,
            componentId,
          })),
        );
      }
    });
    throw redirect(`/admin/schedules/${id}`);
  }

  return null;
}

export default function EditSchedule() {
  const { schedule, allComponents, linkedComponentIds } =
    useLoaderData<typeof loader>();
  const linkedSet = new Set(linkedComponentIds);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Link
            to="/admin/schedules"
            className="text-xs text-slate-500 underline"
          >
            ← Back to schedules
          </Link>
          <h1 className="mt-2 text-xl font-semibold">{schedule.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(schedule.scheduledStart)} →{' '}
            {formatDateTime(schedule.scheduledEnd)}
            {schedule.startedAt &&
              ` · Started ${formatRelative(schedule.startedAt)}`}
            {schedule.completedAt &&
              ` · Completed ${formatRelative(schedule.completedAt)}`}
          </p>
        </div>
        <Form
          method="post"
          onSubmit={(e) => {
            if (
              !confirm(`Delete "${schedule.title}"? This can't be undone.`)
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

      <Section title="Lifecycle">
        <div className="flex flex-wrap gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="mark_started" />
            <button
              type="submit"
              disabled={schedule.startedAt !== null}
              className={lifecycleBtn}
            >
              {schedule.startedAt ? 'Already started' : 'Mark started'}
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="mark_completed" />
            <button
              type="submit"
              disabled={schedule.completedAt !== null}
              className={lifecycleBtn}
            >
              {schedule.completedAt ? 'Already completed' : 'Mark completed'}
            </button>
          </Form>
        </div>
      </Section>

      <Section title="Metadata">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update_metadata" />
          <Field label="Title">
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={schedule.title}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scheduled start">
              <input
                type="datetime-local"
                name="scheduledStart"
                required
                defaultValue={toDatetimeLocalValue(schedule.scheduledStart)}
                className={inputClass}
              />
            </Field>
            <Field label="Scheduled end">
              <input
                type="datetime-local"
                name="scheduledEnd"
                required
                defaultValue={toDatetimeLocalValue(schedule.scheduledEnd)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              defaultValue={schedule.description ?? ''}
              className={inputClass}
            />
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
    </div>
  );
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';

const primaryBtn =
  'rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900';

const lifecycleBtn =
  'rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800';

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
