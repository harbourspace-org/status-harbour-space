import { asc, desc, gte, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from './client';
import {
  componentGroups,
  components,
  incidentComponents,
  incidentUpdates,
  incidents,
} from './schema';
import {
  type DerivedStatus,
  compute90DayUptime,
  computeComponentStatuses,
  worstStatus,
} from './status';

export type PublicComponent = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  group: string | null;
  status: DerivedStatus;
  uptime_90d: number | null;
  is_external: boolean;
};

export type PublicComponentsPayload = {
  generated_at: string;
  overall: DerivedStatus;
  components: PublicComponent[];
};

export async function getPublicComponents(): Promise<PublicComponentsPayload> {
  const [groupRows, componentRows] = await Promise.all([
    db.select().from(componentGroups),
    db
      .select()
      .from(components)
      .orderBy(asc(components.sortOrder), asc(components.name)),
  ]);

  const monitored = componentRows.filter((c) => !c.isExternal);
  const [statusMap, uptimeMap] = await Promise.all([
    computeComponentStatuses(
      monitored.map((c) => ({
        componentId: c.id,
        severityWhenDown: c.severityWhenDown as Exclude<
          DerivedStatus,
          'operational' | 'no_data'
        >,
      })),
    ),
    compute90DayUptime(),
  ]);

  const groupNameById = new Map(groupRows.map((g) => [g.id, g.name] as const));

  const list: PublicComponent[] = componentRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    group: c.groupId === null ? null : groupNameById.get(c.groupId) ?? null,
    status: c.isExternal
      ? ('no_data' as DerivedStatus)
      : statusMap.get(c.id) ?? ('no_data' as DerivedStatus),
    uptime_90d: uptimeMap.get(c.id) ?? null,
    is_external: c.isExternal,
  }));

  return {
    generated_at: new Date().toISOString(),
    overall: worstStatus(statusMap.values()),
    components: list,
  };
}

export type PublicIncidentUpdate = {
  status: string;
  message: string;
  posted_at: string;
};

export type PublicIncident = {
  id: number;
  title: string;
  current_status: string;
  severity: string;
  is_auto_created: boolean;
  started_at: string;
  resolved_at: string | null;
  components: string[];
  updates: PublicIncidentUpdate[];
};

export type PublicIncidentsPayload = {
  generated_at: string;
  incidents: PublicIncident[];
};

const INCIDENT_HISTORY_DAYS = 90;
const INCIDENT_LIMIT = 50;

export async function getPublicIncidents(): Promise<PublicIncidentsPayload> {
  const incidentRows = await db
    .select()
    .from(incidents)
    .where(
      or(
        isNull(incidents.resolvedAt),
        gte(
          incidents.startedAt,
          sql`NOW() - (${INCIDENT_HISTORY_DAYS} || ' days')::interval`,
        ),
      ),
    )
    .orderBy(desc(incidents.startedAt))
    .limit(INCIDENT_LIMIT);

  if (incidentRows.length === 0) {
    return { generated_at: new Date().toISOString(), incidents: [] };
  }

  const ids = incidentRows.map((i) => i.id);

  const [updateRows, linkRows, componentRows] = await Promise.all([
    db
      .select()
      .from(incidentUpdates)
      .where(inArray(incidentUpdates.incidentId, ids))
      .orderBy(asc(incidentUpdates.postedAt)),
    db
      .select()
      .from(incidentComponents)
      .where(inArray(incidentComponents.incidentId, ids)),
    db.select({ id: components.id, name: components.name }).from(components),
  ]);

  const componentNameById = new Map(
    componentRows.map((c) => [c.id, c.name] as const),
  );

  const list: PublicIncident[] = incidentRows.map((i) => ({
    id: i.id,
    title: i.title,
    current_status: i.currentStatus,
    severity: i.severity,
    is_auto_created: i.isAutoCreated,
    started_at: i.startedAt.toISOString(),
    resolved_at: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    components: linkRows
      .filter((l) => l.incidentId === i.id)
      .map((l) => componentNameById.get(l.componentId))
      .filter((n): n is string => Boolean(n)),
    updates: updateRows
      .filter((u) => u.incidentId === i.id)
      .map((u) => ({
        status: u.status,
        message: u.message,
        posted_at: u.postedAt.toISOString(),
      })),
  }));

  return { generated_at: new Date().toISOString(), incidents: list };
}
