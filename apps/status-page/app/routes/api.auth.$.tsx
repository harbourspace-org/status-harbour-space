import { Auth } from '@auth/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authConfig } from '../auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  console.log('[auth] pathname:', url.pathname);
  console.log('[auth] search:', url.search);
  return Auth(request, authConfig);
}
export async function action({ request }: ActionFunctionArgs) {
  return Auth(request, authConfig);
}