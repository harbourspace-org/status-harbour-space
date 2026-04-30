import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { notifyIncident } from '../notifications.server';
import { db } from './client';
import {
  components as componentsTable,
  incidentComponents,
  incidentUpdates,
  incidents,
} from './schema';
import {
  type DerivedStatus,
  computeComponentStatuses,
} from './status';

type AutoIncidentSeverity = Exclude<
  DerivedStatus,
  'operational' | 'no_data' | 'under_maintenance'
>;

function isAutoIncidentSeverity(s: DerivedStatus): s is AutoIncidentSeverity {
  return (
    s === 'performance_issues' ||
    s === 'partial_outage' ||
    s === 'major_outage'
  );
}

// Reacts to a fresh batch of probes by recomputing the affected
// components' status and either opening an auto-incident (if a component
// just turned degraded with no open auto-incident) or posting a
// "monitoring" update on the existing one (if it just recovered).
//
// Designed to be idempotent — calling it repeatedly for the same state
// is a no-op once the auto-incident exists or the monitoring update has
// already been posted.
export async function reactToProbeBatch(componentIds: number[]): Promise<void> {
  if (componentIds.length === 0) return;

  const componentRows = await db
    .select({
      id: componentsTable.id,
      name: componentsTable.name,
      severityWhenDown: componentsTable.severityWhenDown,
      isExternal: componentsTable.isExternal,
    })
    .from(componentsTable)
    .where(inArray(componentsTable.id, componentIds));

  const monitored = componentRows.filter((c) => !c.isExternal);
  if (monitored.length === 0) return;

  const statusMap = await computeComponentStatuses(
    monitored.map((c) => ({
      componentId: c.id,
      severityWhenDown: c.severityWhenDown as AutoIncidentSeverity,
    })),
  );

  for (const c of monitored) {
    const status = statusMap.get(c.id) ?? 'no_data';
    await reactOne(c.id, c.name, status);
  }
}

async function reactOne(
  componentId: number,
  componentName: string,
  status: DerivedStatus,
): Promise<void> {
  const open = await findOpenAutoIncidentFor(componentId);

  if (!open) {
    if (isAutoIncidentSeverity(status)) {
      await openAutoIncident(componentId, componentName, status);
    }
    return;
  }

  if (status === 'operational') {
    const lastUpdate = await db
      .select({ status: incidentUpdates.status })
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, open.id))
      .orderBy(desc(incidentUpdates.postedAt))
      .limit(1);
    if (lastUpdate[0]?.status === 'monitoring') return;
    await postMonitoringUpdate(
      open.id,
      open.title,
      open.severity,
      componentId,
      componentName,
    );
  }
}

async function findOpenAutoIncidentFor(componentId: number): Promise<
  | {
      id: number;
      title: string;
      severity: AutoIncidentSeverity;
    }
  | null
> {
  const rows = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      severity: incidents.severity,
    })
    .from(incidents)
    .innerJoin(
      incidentComponents,
      eq(incidentComponents.incidentId, incidents.id),
    )
    .where(
      and(
        eq(incidents.isAutoCreated, true),
        isNull(incidents.resolvedAt),
        eq(incidentComponents.componentId, componentId),
      ),
    )
    .orderBy(desc(incidents.startedAt))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    severity: r.severity as AutoIncidentSeverity,
  };
}

async function openAutoIncident(
  componentId: number,
  componentName: string,
  severity: AutoIncidentSeverity,
): Promise<void> {
  const message = `Automatic monitoring detected ${componentName} is failing. Investigating.`;
  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(incidents)
      .values({
        title: `${componentName} degraded`,
        severity,
        currentStatus: 'investigating',
        isAutoCreated: true,
      })
      .returning({ id: incidents.id });

    await tx.insert(incidentComponents).values({
      incidentId: created.id,
      componentId,
    });

    await tx.insert(incidentUpdates).values({
      incidentId: created.id,
      status: 'investigating',
      message,
      postedBy: 'auto-monitor',
    });

    return created.id;
  });

  await notifyIncident({
    kind: 'opened',
    incidentId: newId,
    title: `${componentName} degraded`,
    severity,
    status: 'investigating',
    message,
    componentNames: [componentName],
    componentIds: [componentId],
  });
}

async function postMonitoringUpdate(
  incidentId: number,
  title: string,
  severity: AutoIncidentSeverity,
  componentId: number,
  componentName: string,
): Promise<void> {
  const message =
    `Probes are reporting ${componentName} as healthy again. Monitoring before resolving.`;

  await db.transaction(async (tx) => {
    await tx.insert(incidentUpdates).values({
      incidentId,
      status: 'monitoring',
      message,
      postedBy: 'auto-monitor',
    });
    await tx
      .update(incidents)
      .set({ currentStatus: 'monitoring', updatedAt: new Date() })
      .where(eq(incidents.id, incidentId));
  });

  await notifyIncident({
    kind: 'update',
    incidentId,
    title,
    severity,
    status: 'monitoring',
    message,
    componentNames: [componentName],
    componentIds: [componentId],
  });
}
