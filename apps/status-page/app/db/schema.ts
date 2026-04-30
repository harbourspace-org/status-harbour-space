import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Component-level status — what the public homepage renders for each
// row. Severity columns reuse this enum but exclude `operational` at
// the app level.
export const componentStatus = pgEnum('component_status', [
  'operational',
  'performance_issues',
  'partial_outage',
  'major_outage',
  'under_maintenance',
]);

// Incident lifecycle, mirrors what /admin lets you transition through.
export const incidentStatus = pgEnum('incident_status', [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
]);

export const componentGroups = pgTable('component_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const components = pgTable('components', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => componentGroups.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  description: text('description'),
  probeUrl: text('probe_url').notNull(),
  expectedStatus: integer('expected_status').notNull().default(200),
  // Optional case-insensitive substring that must appear in the response
  // body for the probe to count as ok. Catches the "200 but blank/error
  // page" class of false negatives. Null = body not checked.
  expectedBodySubstring: text('expected_body_substring'),
  severityWhenDown: componentStatus('severity_when_down')
    .notNull()
    .default('major_outage'),
  // Third-party providers we mirror but don't probe ourselves (e.g. AWS,
  // Cloudflare, GitHub status pages). UI links out instead of showing
  // a probe-derived status.
  isExternal: boolean('is_external').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agents = pgTable('agents', {
  id: varchar('id', { length: 64 }).primaryKey(),
  region: varchar('region', { length: 32 }).notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const probes = pgTable(
  'probes',
  {
    id: serial('id').primaryKey(),
    componentId: integer('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    agentId: varchar('agent_id', { length: 64 })
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    ok: boolean('ok').notNull(),
    statusCode: integer('status_code'),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byComponentObservedAt: index('probes_component_observed_at_idx').on(
      t.componentId,
      t.observedAt,
    ),
    byAgentObservedAt: index('probes_agent_observed_at_idx').on(
      t.agentId,
      t.observedAt,
    ),
  }),
);

export const incidents = pgTable('incidents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  currentStatus: incidentStatus('current_status')
    .notNull()
    .default('investigating'),
  severity: componentStatus('severity').notNull(),
  isAutoCreated: boolean('is_auto_created').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const incidentComponents = pgTable(
  'incident_components',
  {
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    componentId: integer('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.incidentId, t.componentId] }),
  }),
);

export const incidentUpdates = pgTable(
  'incident_updates',
  {
    id: serial('id').primaryKey(),
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    status: incidentStatus('status').notNull(),
    message: text('message').notNull(),
    postedBy: text('posted_by'),
    postedAt: timestamp('posted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byIncidentPostedAt: index('incident_updates_incident_posted_at_idx').on(
      t.incidentId,
      t.postedAt,
    ),
  }),
);

export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
  scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const scheduleComponents = pgTable(
  'schedule_components',
  {
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, { onDelete: 'cascade' }),
    componentId: integer('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scheduleId, t.componentId] }),
  }),
);

export const subscribers = pgTable(
  'subscribers',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    // null component_id = subscribed to incidents for all components
    componentId: integer('component_id').references(() => components.id, {
      onDelete: 'cascade',
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribeToken: uuid('unsubscribe_token').notNull().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byEmail: index('subscribers_email_idx').on(t.email),
  }),
);
