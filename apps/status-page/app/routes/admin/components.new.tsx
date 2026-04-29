import { asc } from 'drizzle-orm';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';

import {
  ComponentFormFields,
  parseComponentForm,
} from '../../admin/component-form';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import { componentGroups, components } from '../../db/schema';
import type { Route } from './+types/components.new';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const groups = await db
    .select({ id: componentGroups.id, name: componentGroups.name })
    .from(componentGroups)
    .orderBy(asc(componentGroups.sortOrder), asc(componentGroups.name));
  return { groups };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const result = parseComponentForm(form);
  if (!result.ok) return { errors: result.errors, values: formToObject(form) };

  try {
    await db.insert(components).values({
      name: result.values.name,
      slug: result.values.slug,
      groupId: result.values.groupId,
      description: result.values.description || null,
      probeUrl: result.values.probeUrl,
      expectedStatus: result.values.expectedStatus,
      severityWhenDown: result.values.severityWhenDown,
      isExternal: result.values.isExternal,
      sortOrder: result.values.sortOrder,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        errors: { slug: 'A component with this slug already exists' },
        values: formToObject(form),
      };
    }
    throw e;
  }
  throw redirect('/admin/components');
}

function formToObject(form: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of form.entries()) obj[k] = String(v);
  return obj;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === '23505'
  );
}

export default function NewComponent() {
  const { groups } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const defaults = actionData?.values
    ? {
        name: actionData.values.name,
        slug: actionData.values.slug,
        groupId:
          actionData.values.groupId === '' || actionData.values.groupId === undefined
            ? null
            : Number(actionData.values.groupId),
        probeUrl: actionData.values.probeUrl,
        expectedStatus: Number(actionData.values.expectedStatus ?? 200),
        severityWhenDown: actionData.values.severityWhenDown as
          | 'performance_issues'
          | 'partial_outage'
          | 'major_outage'
          | 'under_maintenance',
        sortOrder: Number(actionData.values.sortOrder ?? 0),
        description: actionData.values.description ?? '',
        isExternal: actionData.values.isExternal === 'on',
      }
    : undefined;
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          to="/admin/components"
          className="text-xs text-slate-500 underline"
        >
          ← Back to components
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Add component</h1>
      </div>
      <ComponentFormFields
        groups={groups}
        defaults={defaults}
        errors={actionData?.errors}
        submitLabel="Create component"
      />
    </div>
  );
}
