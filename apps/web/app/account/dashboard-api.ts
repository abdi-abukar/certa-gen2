export class AccountApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'AccountApiError'; }
}

export async function accountApi<T>(path: string, options?: { signal?: AbortSignal; body?: object; idempotency?: boolean | string }): Promise<T> {
  const response = await fetch(path, { method: options?.body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal: options?.signal,
    headers: options?.body ? { 'Content-Type': 'application/json', ...(options.idempotency ? { 'Idempotency-Key': typeof options.idempotency === 'string' ? options.idempotency : crypto.randomUUID() } : {}) } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined });
  const failure = !response.ok ? await response.json().catch(() => ({})) : null;
  if (response.status === 401 || response.status === 403 && failure?.error === 'second_factor_required') {
    if (typeof window !== 'undefined') window.location.replace('/login');
    throw new AccountApiError('Your session has expired. Sign in again.', response.status);
  }
  if (!response.ok) throw new AccountApiError(response.status === 403 ? 'This action is not available for your session.' : 'We couldn’t load this information. Please try again.', response.status);
  return response.json();
}
