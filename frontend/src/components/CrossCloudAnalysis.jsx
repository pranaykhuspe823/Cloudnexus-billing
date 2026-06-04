import React, { useEffect, useState } from 'react';
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function Card({ title, subtitle, accent, children }) {
  return (
    <div className="section-card">
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: accent, display: 'inline-block' }} />
        {title}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{subtitle}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Money({ value }) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

function fmtConnectivity(c) {
  if (!c) return '—';
  if (c === 'connected') return 'Connected';
  if (c === 'disconnected') return 'Disconnected';
  if (c === 'data_unavailable') return 'Data unavailable';
  return c;
}

export default function CrossCloudAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${BASE}/api/analysis?mode=real`);
        if (cancelled) return;
        setData(res.data);
      } catch (e) {
        if (cancelled) return;
        setError(e?.response?.data?.detail || e.message || 'Failed to load analysis');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="section-card">
        <div className="section-title">Cross-cloud analysis</div>
        <div className="muted-text" style={{ padding: '12px 0' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-card">
        <div className="section-title">Cross-cloud analysis</div>
        <div className="error-banner">{error}</div>

      </div>
    );
  }

  if (!data) return null;

  const cards = data.cards || {};
  const recs = data.recommendations || [];
  const tips = data.tips || [];

  const groupByCloud = (arr) => {
    const out = { aws: [], gcp: [], azure: [] };
    for (const r of arr) {
      const c = (r.cloud || '').toLowerCase();
      if (out[c]) out[c].push(r);
    }
    return out;
  };

  const grouped = groupByCloud(recs);

  function recRow(r, idx) {
    const key = `${r.cloud}-${r.service_name}-${idx}`;
    return (
      <div key={key} className="recommendation-row">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {r.cloud?.toUpperCase()} · {r.service_name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {fmtConnectivity(r.connectivity)} · {r.region || '—'}
          </div>
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12 }}>
            Daily: <b><Money value={r.daily_cost} /></b>
          </div>
          <div style={{ fontSize: 12 }}>
            Monthly: <b><Money value={r.monthly_cost} /></b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            User name: <b>{r.user_kept_name || '—'}</b>
          </div>
        </div>
        {Array.isArray(r.tips) && r.tips.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
            <div style={{ fontWeight: 650, marginBottom: 4 }}>Tips</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {r.tips.slice(0, 4).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(r.affected_resources) && r.affected_resources.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 650, fontSize: 12, marginBottom: 6 }}>Affected resources (best-effort)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.affected_resources.slice(0, 5).map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text2)' }}>
                  <a href={a.console_url || '#'} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {a.name || '—'}
                  </a>
                  <span style={{ color: 'var(--text3)' }}> · {a.type || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.connectivity === 'data_unavailable' && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning)' }}>
            Data unavailable. If you want resource-level accuracy for this cloud, connect with the required billing export / permissions.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="three-col">
        <Card
          title="Combined"
          subtitle="AWS + GCP + Azure services running"
          accent="#64748b"
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>{cards.combined?.services_running_count ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{cards.combined?.status || ''}</div>
        </Card>

        <Card
          title="AWS"
          subtitle="Services running (best-effort)"
          accent="#FF9900"
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>{cards.aws?.services_running_count ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {cards.aws?.primary_region || '—'} · {cards.aws?.status || ''}
          </div>
        </Card>

        <Card
          title="GCP"
          subtitle="Services running (best-effort)"
          accent="#4285F4"
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>{cards.gcp?.services_running_count ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {cards.gcp?.primary_region || '—'} · {cards.gcp?.status || ''}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }} />

      <div className="three-col">
        <Card
          title="Azure"
          subtitle="Services running (best-effort)"
          accent="#008AD7"
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>{cards.azure?.services_running_count ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {cards.azure?.primary_region || '—'} · {cards.azure?.status || ''}
          </div>
        </Card>

        <div className="section-card" style={{ gridColumn: 'span 2' }}>
          <div className="section-title">Recommendations (who/what/where)</div>

          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Each recommendation includes: cloud, service name, region, connectivity, your saved name, daily/monthly cost, and actionable tips.
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {recs.length === 0 ? (
              <div className="muted-text">No recommendations available.</div>
            ) : (
              ['aws', 'gcp', 'azure'].flatMap((cloud) => {
                const arr = grouped[cloud] || [];
                if (!arr.length) return [];
                return [
                  <div key={cloud}>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                      {cloud.toUpperCase()}
                    </div>
                    {arr.map((r, i) => recRow(r, i))}
                  </div>
                ];
              })
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }} className="section-card">
        <div className="section-title">Comparison table</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
          Best-effort cross-cloud cost comparison based on currently available service-level data.
        </div>
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8faff' }}>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', textAlign: 'left' }}>Cloud</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', textAlign: 'left' }}>Services</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', textAlign: 'left' }}>Region</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', textAlign: 'right' }}>daily Cost</th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', textAlign: 'left' }}>monthly cost compatitor</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(recs) && recs.length > 0 ? (
                recs.map((r, i) => {
                  const competitor = r.competitor || {};
                  return (
                    <tr key={`${r.cloud}-${r.service_name}-${i}`} style={{ borderBottom: '1px solid #f0f4ff' }}>
                      <td style={{ padding: '8px 10px', color: '#374151', fontWeight: 600 }}>{(r.cloud || '').toUpperCase()}</td>
                      <td style={{ padding: '8px 10px', color: '#374151' }}>{r.service_name || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#374151' }}>{r.user_kept_name || '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{r.region || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                        <Money value={r.daily_cost} />
                      </td>
                      <td style={{ padding: '8px 10px', color: '#374151' }}>
                        {competitor.cloud ? competitor.cloud.toUpperCase() : '—'}{competitor.service_name ? ` · ${competitor.service_name}` : ''}
                        {competitor.monthly_cost !== undefined && competitor.monthly_cost !== null ? (
                          <span style={{ color: 'var(--text3)' }}> · ${Number(competitor.monthly_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: 10, color: 'var(--text3)' }}>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

