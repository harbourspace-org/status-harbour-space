import { Auth } from '@auth/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authConfig } from '../auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  console.log('[auth] loader URL:', request.url);
  return Auth(request, authConfig);
}

export async function action({ request }: ActionFunctionArgs) {
  console.log('[auth] action URL:', request.url);
  return Auth(request, authConfig);
}