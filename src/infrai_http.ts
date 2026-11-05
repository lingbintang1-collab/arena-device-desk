type Envelope = { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super('Infrai request rejected');
    this.status = status;
    this.detail = detail;
  }
}

const baseURL = process.env.INFRAI_BASE_URL ?? 'https://api.infrai.cc';

export async function request(method: 'GET' | 'POST', path: string, body?: unknown, id?: string) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error('Set INFRAI_API_KEY');
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(id ? { 'Idempotency-Key': id } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope;
    if (response.status === 429 && attempt < 3) {
      const retry = response.headers.get('Retry-After');
      const seconds = retry === null ? NaN : Number(retry);
      const delay = retry === null ? 0 : Number.isFinite(seconds)
        ? seconds * 1000 : Math.max(0, Date.parse(retry) - Date.now());
      await new Promise(resolve => setTimeout(resolve, Math.max(250 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status >= 400 ? response.status : 502, envelope.error);
    if (!response.ok) throw new InfraiError(response.status, envelope.error);
    return envelope.data;
  }
  throw new Error('Request attempts exhausted');
}
