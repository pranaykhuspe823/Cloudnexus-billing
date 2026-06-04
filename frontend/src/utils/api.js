const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  return data;
}

export const api = {
  saveReportSchedule: (email, time) =>
    request('POST', '/api/report/schedule', { email, time }),

  deleteReportSchedule: (email) =>
    request('DELETE', `/api/report/schedule/${encodeURIComponent(email)}`),

  sendReportNow: (email) =>
    request('POST', '/api/report/send-now', { email }),
};
