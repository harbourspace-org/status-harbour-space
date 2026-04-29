import { Form } from 'react-router';

export type SeverityValue =
  | 'performance_issues'
  | 'partial_outage'
  | 'major_outage'
  | 'under_maintenance';

export const SEVERITY_OPTIONS: Array<{ value: SeverityValue; label: string }> =
  [
    { value: 'performance_issues', label: 'Performance issues' },
    { value: 'partial_outage', label: 'Partial outage' },
    { value: 'major_outage', label: 'Major outage' },
    { value: 'under_maintenance', label: 'Under maintenance' },
  ];

export type ComponentFormValues = {
  name: string;
  slug: string;
  groupId: number | null;
  description: string;
  probeUrl: string;
  expectedStatus: number;
  severityWhenDown: SeverityValue;
  isExternal: boolean;
  sortOrder: number;
};

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function parseComponentForm(form: FormData):
  | { ok: true; values: ComponentFormValues }
  | { ok: false; errors: Partial<Record<keyof ComponentFormValues, string>> } {
  const errors: Partial<Record<keyof ComponentFormValues, string>> = {};

  const name = String(form.get('name') ?? '').trim();
  if (!name) errors.name = 'Required';
  else if (name.length > 200) errors.name = 'Max 200 chars';

  const slug = String(form.get('slug') ?? '')
    .trim()
    .toLowerCase();
  if (!slug) errors.slug = 'Required';
  else if (slug.length > 64) errors.slug = 'Max 64 chars';
  else if (!SLUG_REGEX.test(slug))
    errors.slug = 'Lowercase letters, digits, and dashes only';

  const groupRaw = String(form.get('groupId') ?? '').trim();
  const groupId = groupRaw === '' ? null : Number(groupRaw);
  if (groupId !== null && !Number.isInteger(groupId))
    errors.groupId = 'Invalid group';

  const description = String(form.get('description') ?? '').trim();

  const probeUrl = String(form.get('probeUrl') ?? '').trim();
  if (!probeUrl) errors.probeUrl = 'Required';
  else {
    try {
      const u = new URL(probeUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:')
        errors.probeUrl = 'Must be http(s)';
    } catch {
      errors.probeUrl = 'Invalid URL';
    }
  }

  const expectedStatus = Number(form.get('expectedStatus') ?? 200);
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)
    errors.expectedStatus = '100–599';

  const severityWhenDown = String(form.get('severityWhenDown') ?? '');
  if (!SEVERITY_OPTIONS.some((o) => o.value === severityWhenDown))
    errors.severityWhenDown = 'Pick a severity';

  const isExternal = form.get('isExternal') === 'on';

  const sortOrder = Number(form.get('sortOrder') ?? 0);
  if (!Number.isInteger(sortOrder)) errors.sortOrder = 'Must be integer';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    values: {
      name,
      slug,
      groupId,
      description,
      probeUrl,
      expectedStatus,
      severityWhenDown: severityWhenDown as SeverityValue,
      isExternal,
      sortOrder,
    },
  };
}

type Props = {
  groups: Array<{ id: number; name: string }>;
  defaults?: Partial<ComponentFormValues>;
  errors?: Partial<Record<keyof ComponentFormValues, string>>;
  submitLabel: string;
};

export function ComponentFormFields({
  groups,
  defaults = {},
  errors = {},
  submitLabel,
}: Props) {
  return (
    <Form method="post" className="space-y-5">
      <Field label="Name" error={errors.name}>
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={defaults.name ?? ''}
          className={inputClass}
        />
      </Field>
      <Field
        label="Slug"
        error={errors.slug}
        hint="Lowercase letters, digits, and dashes. Used in URLs."
      >
        <input
          name="slug"
          required
          maxLength={64}
          defaultValue={defaults.slug ?? ''}
          className={inputClass}
        />
      </Field>
      <Field label="Group" error={errors.groupId}>
        <select
          name="groupId"
          defaultValue={defaults.groupId === null || defaults.groupId === undefined ? '' : String(defaults.groupId)}
          className={inputClass}
        >
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Probe URL" error={errors.probeUrl}>
        <input
          type="url"
          name="probeUrl"
          required
          defaultValue={defaults.probeUrl ?? ''}
          className={inputClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Expected status" error={errors.expectedStatus}>
          <input
            type="number"
            name="expectedStatus"
            min={100}
            max={599}
            defaultValue={defaults.expectedStatus ?? 200}
            className={inputClass}
          />
        </Field>
        <Field label="Severity when down" error={errors.severityWhenDown}>
          <select
            name="severityWhenDown"
            defaultValue={defaults.severityWhenDown ?? 'major_outage'}
            className={inputClass}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort order" error={errors.sortOrder}>
          <input
            type="number"
            name="sortOrder"
            defaultValue={defaults.sortOrder ?? 0}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Description" hint="Optional. Shown under the component name on the public page.">
        <textarea
          name="description"
          rows={2}
          defaultValue={defaults.description ?? ''}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isExternal"
          defaultChecked={defaults.isExternal ?? false}
        />
        <span>External provider — UI links out instead of probing</span>
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          {submitLabel}
        </button>
      </div>
    </Form>
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
