import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import { db } from './client';
import { subscribers } from './schema';

export type SubscribeResult =
  | { kind: 'new'; token: string; alreadyConfirmed: false }
  | { kind: 'resend'; token: string; alreadyConfirmed: false }
  | { kind: 'already'; token: string; alreadyConfirmed: true };

// Returns the existing token if a row already exists for (email, componentId);
// otherwise inserts and returns the new token. Either way the caller is
// expected to email the confirm link unless `alreadyConfirmed` is true.
export async function subscribe(
  email: string,
  componentId: number | null,
): Promise<SubscribeResult> {
  const existing = await db
    .select({
      id: subscribers.id,
      token: subscribers.unsubscribeToken,
      confirmedAt: subscribers.confirmedAt,
    })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.email, email),
        componentId === null
          ? isNull(subscribers.componentId)
          : eq(subscribers.componentId, componentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    if (row.confirmedAt !== null) {
      return { kind: 'already', token: row.token, alreadyConfirmed: true };
    }
    return { kind: 'resend', token: row.token, alreadyConfirmed: false };
  }

  const [created] = await db
    .insert(subscribers)
    .values({ email, componentId })
    .returning({ token: subscribers.unsubscribeToken });

  return { kind: 'new', token: created.token, alreadyConfirmed: false };
}

export async function confirmSubscription(token: string): Promise<boolean> {
  const result = await db
    .update(subscribers)
    .set({ confirmedAt: new Date() })
    .where(eq(subscribers.unsubscribeToken, token))
    .returning({ id: subscribers.id });
  return result.length > 0;
}

export async function unsubscribe(token: string): Promise<boolean> {
  const result = await db
    .delete(subscribers)
    .where(eq(subscribers.unsubscribeToken, token))
    .returning({ id: subscribers.id });
  return result.length > 0;
}

export type SubscriberRecipient = {
  id: number;
  email: string;
  token: string;
};

// Returns confirmed subscribers whose component_id is NULL (all
// components) or matches one of the incident's components. De-duplicated
// by id (SQL handles that — a subscriber can only have one row per
// (email, component) pair).
export async function findRecipientsForIncident(
  componentIds: number[],
): Promise<SubscriberRecipient[]> {
  const rows = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      token: subscribers.unsubscribeToken,
    })
    .from(subscribers)
    .where(
      and(
        isNotNull(subscribers.confirmedAt),
        componentIds.length > 0
          ? or(
              isNull(subscribers.componentId),
              inArray(subscribers.componentId, componentIds),
            )
          : isNull(subscribers.componentId),
      ),
    );
  return rows;
}
