import { Form, redirect, useActionData, useSearchParams } from 'react-router';

import {
  getAdminSession,
  isAdminEmail,
  issueMagicLinkToken,
} from '../../auth.server';
import { sendEmail } from '../../email.server';
import type { Route } from './+types/login';

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getAdminSession(request);
  const email = session.get('email') as string | undefined;
  if (email && isAdminEmail(email)) {
    const url = new URL(request.url);
    throw redirect(url.searchParams.get('redirectTo') ?? '/admin');
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const redirectTo = String(form.get('redirectTo') ?? '/admin');

  // Always pretend the link was sent so we don't leak which addresses
  // are on the admin allowlist.
  if (!email || !isAdminEmail(email)) {
    return { sent: true };
  }

  const token = issueMagicLinkToken(email);
  const baseUrl = process.env.APP_URL ?? new URL(request.url).origin;
  const link = `${baseUrl}/admin/callback?token=${encodeURIComponent(
    token,
  )}&redirectTo=${encodeURIComponent(redirectTo)}`;

  await sendEmail({
    to: email,
    subject: 'Sign in to Harbour.Space Status admin',
    text: `Open this link to sign in:\n\n${link}\n\nThe link expires in 15 minutes. If you didn't request this, ignore the email.`,
    html: `<p>Open this link to sign in:</p><p><a href="${link}">${link}</a></p><p>The link expires in 15 minutes. If you didn't request this, ignore the email.</p>`,
  });

  return { sent: true };
}

export default function AdminLogin() {
  const data = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/admin';

  if (data?.sent) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          If your address is on the admin allowlist, a sign-in link is on its
          way. The link expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Status admin sign-in</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Enter your harbour.space email and we'll send you a sign-in link.
      </p>
      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoFocus
            autoComplete="email"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          Send sign-in link
        </button>
      </Form>
    </div>
  );
}
