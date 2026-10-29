// Wikipedia REST API — free, no key. Used for cast/crew biographies, which TVmaze doesn't provide.
export interface Bio {
  title: string;
  description?: string;
  extract: string;
  url: string;
}

interface Summary {
  type: string;
  title: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

const PROFESSION =
  /\b(actor|actress|comedian|singer|director|writer|presenter|host|producer|model|musician|rapper|personality|filmmaker|screenwriter|dancer|journalist|athlete|player|performer|chef|author|voice)\b/i;

const bioCache = new Map<string, Promise<Bio | null>>();

async function fetchSummary(title: string): Promise<Summary | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
    );
    if (!res.ok) return null;
    return (await res.json()) as Summary;
  } catch {
    return null;
  }
}

const toBio = (s: Summary): Bio => ({
  title: s.title,
  description: s.description,
  extract: s.extract ?? '',
  url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)}`,
});

function isPersonPage(s: Summary | null): s is Summary {
  if (!s || s.type !== 'standard' || !s.extract) return false;
  return PROFESSION.test(`${s.description ?? ''} ${s.extract}`);
}

export function getBio(name: string): Promise<Bio | null> {
  const cached = bioCache.get(name);
  if (cached) return cached;
  const promise = (async () => {
    const [actor, actress, plain] = await Promise.all([
      fetchSummary(`${name} (actor)`),
      fetchSummary(`${name} (actress)`),
      fetchSummary(name),
    ]);
    const match = [actor, actress, plain].find(isPersonPage);
    return match ? toBio(match) : null;
  })();
  bioCache.set(name, promise);
  return promise;
}
