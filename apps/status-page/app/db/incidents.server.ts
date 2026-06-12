import { inArray } from 'drizzle-orm';

import { notifyAgentDissent } from '../notifications.server';
import { db } from './client';
import { components as componentsTable } from './schema';
import {
  type DerivedStatus,
  computeComponentStatuses,
  findNewAgentDissent,
} from './status';

// Reacts to a fresh batch of probes by recomputing the affected
// components' status and sending a Slack [heads-up] for single-agent
// dissent — any agent that just flipped ok→fail on a component whose
// consensus still says operational.
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
      severityWhenDown: c.severityWhenDown as Exclude<
        DerivedStatus,
        'operational' | 'no_data'
      >,
    })),
  );

  // Single-agent dissent: any agent that just flipped ok→fail on a
  // component whose consensus still says operational. We only emit
  // the Slack [heads-up] for those.
  const operationalIds = monitored
    .filter((c) => (statusMap.get(c.id) ?? 'no_data') === 'operational')
    .map((c) => c.id);
  if (operationalIds.length > 0) {
    const dissent = await findNewAgentDissent(operationalIds);
    if (dissent.length > 0) {
      await notifyAgentDissent(
        dissent.map((d) => ({
          componentName: d.componentName,
          agentId: d.agentId,
          region: d.region,
        })),
      );
    }
  }
}
