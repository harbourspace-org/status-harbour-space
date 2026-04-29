import { createCookie } from 'react-router';

export const langCookie = createCookie('lang', {
  path: '/',
  sameSite: 'lax',
  httpOnly: false,
  maxAge: 60 * 60 * 24 * 365,
});
