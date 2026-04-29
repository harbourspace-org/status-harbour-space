import { asc, eq } from 'drizzle-orm';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from 'react-router';

import {
  type SeverityValue,
  ComponentFormFields,
  parseComponentForm,
} from '../../admin/component-form';
import { requireAdmin } from '../../auth.server';
import { db } from '../../db/client';
import { componentGroups, components } from '../../db/schema';
import type { Route } from './+types/components.$id';

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response('Not found', { status: 404 });

  const [component, groups] = await Promise.all([
    db.select().from(components).where(eq(components.id, id)).limit(1),
    db
      .select({ id: componentGroups.id, name: componentGroups.name })
      .from(componentGroups)
      .orderBy(asc(componentGroups.sortOrder), asc(componentGroups.name)),
  ]);

  if (component.length === 0)
    throw new Response('Not found', { status: 404 });

  return { component: component[0], groups };
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response('Not found', { status: 404 });

  const form = await request.formData();

  if (form.get('intent') === 'delete') {
    await db.delete(components).where(eq(components.id, id));
    throw redirect('/admin/components');
  }

  const result = parseComponentForm(form);
  if (!result.ok) return { errors: result.errors, values: formToObject(form) };

  try {
    await db
      .update(components)
      .set({
        name: result.values.name,
        slug: result.values.slug,
        groupId: result.values.groupId,
        description: result.values.description || null,
        probeUrl: result.values.probeUrl,
        expectedStatus: result.values.expectedStatus,
        severityWhenDown: result.values.severityWhenDown,
        isExternal: result.values.isExternal,
        sortOrder: result.values.sortOrder,
      })
      .where(eq(components.id, id));
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

export default function EditComponent() {
  const { component, groups } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const defaults = actionData?.values
    ? {
        name: actionData.values.name ?? component.name,
        slug: actionData.values.slug ?? component.slug,
        groupId:
          actionData.values.groupId === '' || actionData.values.groupId === undefined
            ? null
            : Number(actionData.values.groupId),
        probeUrl: actionData.values.probeUrl ?? component.probeUrl,
        expectedStatus: Number(
          actionData.values.expectedStatus ?? component.expectedStatus,
        ),
        severityWhenDown: (actionData.values.severityWhenDown ??
          component.severityWhenDown) as SeverityValue,
        sortOrder: Number(actionData.values.sortOrder ?? component.sortOrder),
        description:
          actionData.values.description ?? component.description ?? '',
        isExternal: actionData.values.isExternal === 'on',
      }
    : {
        name: component.name,
        slug: component.slug,
        groupId: component.groupId,
        probeUrl: component.probeUrl,
        expectedStatus: component.expectedStatus,
        severityWhenDown: component.severityWhenDown as SeverityValue,
        sortOrder: component.sortOrder,
        description: component.description ?? '',
        isExternal: component.isExternal,
      };

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Link
            to="/admin/components"
            className="text-xs text-slate-500 underline"
          >
            ← Back to components
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Edit component</h1>
        </div>
        <Form
          method="post"
          onSubmit={(e) => {
            if (
              !confirm(
                `Delete "${component.name}"? Probes referencing it will be removed too.`,
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
      <ComponentFormFields
        groups={groups}
        defaults={defaults}
        errors={actionData?.errors}
        submitLabel="Save changes"
      />
    </div>
  );
}
