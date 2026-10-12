import { auth } from './firebase';

const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export async function request(path, { authenticated = false, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (authenticated) {
    if (!auth?.currentUser) throw new Error('Faça login para continuar.');
    headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response;
  try { response = await fetch(`${base}${path}`, { ...options, headers }); }
  catch { throw new Error('Não foi possível conectar à API. Confira se ela está iniciada.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Falha na solicitação (${response.status}).`);
  return data;
}

export function upload(path, file) {
  const body = new FormData();
  body.append('imagem', file);
  return request(path, { method: 'POST', body, authenticated: true });
}
