'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { setSiteEnabled } from '@/lib/db';

const COOKIE = 'lk_admin';

/** True if the current request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const c = (await cookies()).get(COOKIE)?.value;
  return Boolean(c) && c === pw;
}

export async function login(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return { error: 'ADMIN_PASSWORD is not set on the server.' };
  const entered = String(formData.get('password') ?? '');
  if (entered !== pw) return { error: 'Incorrect password.' };
  (await cookies()).set(COOKIE, pw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });
  revalidatePath('/admin');
  return {};
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
  revalidatePath('/admin');
}

export async function toggleSite(formData: FormData): Promise<void> {
  if (!(await isAdmin())) throw new Error('Not authorized');
  const hostname = String(formData.get('hostname'));
  const enabled = String(formData.get('enabled')) === 'true';
  await setSiteEnabled(hostname, enabled);
  revalidatePath('/admin');
  revalidatePath('/');
}
