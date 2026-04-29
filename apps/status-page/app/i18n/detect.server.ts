import { langCookie } from '../cookies.server';
import { DEFAULT_LANG, type Lang, isLang } from './index';

export async function detectLang(request: Request): Promise<Lang> {
  const cookieHeader = request.headers.get('Cookie');
  const fromCookie = await langCookie.parse(cookieHeader);
  if (isLang(fromCookie)) return fromCookie;

  const accept = request.headers.get('Accept-Language');
  if (accept) {
    const tags = accept
      .split(',')
      .map((part) => part.trim().split(';')[0]?.toLowerCase() ?? '');
    for (const tag of tags) {
      const base = tag.split('-')[0];
      if (isLang(base)) return base;
    }
  }
  return DEFAULT_LANG;
}
