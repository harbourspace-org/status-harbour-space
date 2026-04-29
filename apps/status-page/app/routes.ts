import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/_index.tsx'),
  route('admin', 'routes/admin.tsx', [
    index('routes/admin/_index.tsx'),
    route('login', 'routes/admin/login.tsx'),
    route('callback', 'routes/admin/callback.tsx'),
    route('logout', 'routes/admin/logout.tsx'),
    route('components', 'routes/admin/components._index.tsx'),
    route('components/new', 'routes/admin/components.new.tsx'),
    route('components/:id', 'routes/admin/components.$id.tsx'),
  ]),
] satisfies RouteConfig;
