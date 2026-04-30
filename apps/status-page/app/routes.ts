import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/_index.tsx'),
  route('set-lang', 'routes/set-lang.tsx'),
  route('feed.atom', 'routes/feed.atom.tsx'),
  route('api/components', 'routes/api.components.tsx'),
  route('api/incidents', 'routes/api.incidents.tsx'),
  route('api/internal/components', 'routes/api.internal.components.tsx'),
  route('api/internal/heartbeat', 'routes/api.internal.heartbeat.tsx'),
  route('api/internal/probes', 'routes/api.internal.probes.tsx'),
  route('admin', 'routes/admin.tsx', [
    index('routes/admin/_index.tsx'),
    route('login', 'routes/admin/login.tsx'),
    route('callback', 'routes/admin/callback.tsx'),
    route('logout', 'routes/admin/logout.tsx'),
    route('components', 'routes/admin/components._index.tsx'),
    route('components/new', 'routes/admin/components.new.tsx'),
    route('components/:id', 'routes/admin/components.$id.tsx'),
    route('incidents', 'routes/admin/incidents._index.tsx'),
    route('incidents/new', 'routes/admin/incidents.new.tsx'),
    route('incidents/:id', 'routes/admin/incidents.$id.tsx'),
    route('schedules', 'routes/admin/schedules._index.tsx'),
    route('schedules/new', 'routes/admin/schedules.new.tsx'),
    route('schedules/:id', 'routes/admin/schedules.$id.tsx'),
    route('agents', 'routes/admin/agents.tsx'),
  ]),
] satisfies RouteConfig;
