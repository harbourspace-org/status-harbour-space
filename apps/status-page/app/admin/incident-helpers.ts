export const INCIDENT_STATUS_OPTIONS = [
  { value: 'investigating', label: 'Investigating' },
  { value: 'identified', label: 'Identified' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'resolved', label: 'Resolved' },
] as const;

export type IncidentStatusValue =
  (typeof INCIDENT_STATUS_OPTIONS)[number]['value'];

export const INCIDENT_STATUS_LABEL: Record<IncidentStatusValue, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

export function isIncidentStatus(v: unknown): v is IncidentStatusValue {
  return (
    typeof v === 'string' &&
    INCIDENT_STATUS_OPTIONS.some((o) => o.value === v)
  );
}
