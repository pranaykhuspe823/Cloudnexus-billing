import React, { useEffect, useState, useCallback } from 'react';
import { fetchCostComparison } from '../services/api';
import AllServicesTable from './AllServicesTable';
import ProviderLogo from './ProviderLogo';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── colour helpers ───────────────────────────────────────────────────
const COLORS = { aws: '#FF9900', gcp: '#4285F4', azure: '#008AD7' };
const PRIORITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
const BUDGET_COLOR   = { danger: '#ef4444', warning: '#f97316', ok: '#22c55e' };

function fmt(n) {
  if (n === undefined || n === null) return '—';
  const num = Number(n);
  if (!isFinite(num)) return '—';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000)    return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 10,
      fontWeight: 700,
      background: color + '22',
      color,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    }}>{label}</span>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div className="section-card" style={{ padding: 18, ...style }}>
      {children}
    </div>
  );
}

// ─── Provider Summary Cards ───────────────────────────────────────────
function ProviderSummaryCards({ providers, summary }) {
  const PROVIDER_META = {
    aws:   { label: 'AWS' },
    gcp:   { label: 'GCP' },
    azure: { label: 'Azure' },
  };

  return (
    <div className="three-col" style={{ gap: 12 }}>
      {['aws', 'gcp', 'azure'].map(p => {
        const info = providers[p] || {};
        const meta = PROVIDER_META[p];
        const isBestEfficient = summary.most_cost_efficient === p;
        const isMostSavings   = summary.highest_savings_potential === p;
        return (
          <Card key={p}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS[p], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display:'flex', alignItems:'center', gap:5 }}>
                  <ProviderLogo provider={p} size={14} /> {meta.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.1 }}>
                  {fmt(info.mtd)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  MTD · {info.share_pct ?? '—'}% of total
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: (info.delta_pct ?? 0) > 0 ? '#ef4444' : '#22c55e',
                }}>
                  {(info.delta_pct ?? 0) > 0 ? '▲' : '▼'} {Math.abs(info.delta_pct ?? 0)}%
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>vs last month</div>
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Efficiency Score</span>
                <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{info.efficiency_score ?? '—'}/100</span>
              </div>
              <div style={{ height: 6, background: '#f0f4ff', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${info.efficiency_score ?? 0}%`, height: '100%', background: `linear-gradient(90deg, ${COLORS[p]}, ${COLORS[p]}99)`, borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                <span style={{ color: '#64748b' }}>Savings Potential</span>
                <span style={{ fontWeight: 700, color: '#22c55e' }}>{fmt(info.savings_potential)}/mo</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Top Service</span>
                <span style={{ fontWeight: 600, color: '#1a1a2e', maxWidth: 140, textAlign: 'right', lineHeight: 1.3 }}>{info.top_service ?? '—'} ({fmt(info.top_service_cost)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Services</span>
                <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{info.services_count ?? 0} tracked</span>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {isBestEfficient && <Badge label="Most Efficient" color="#22c55e" />}
              {isMostSavings   && <Badge label="Top Savings"    color="#f97316" />}
              {info.real_data  && <Badge label="Live Data"      color="#4285F4" />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Monthly Bar Chart ────────────────────────────────────────────────
function MonthlyComparisonChart({ data }) {
  if (!data || !data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
        <Tooltip formatter={(v, name) => [fmt(v), name.toUpperCase()]} />
        <Legend formatter={v => v.toUpperCase()} />
        <Bar dataKey="aws"   fill={COLORS.aws}   radius={[3,3,0,0]} name="aws"   />
        <Bar dataKey="gcp"   fill={COLORS.gcp}   radius={[3,3,0,0]} name="gcp"   />
        <Bar dataKey="azure" fill={COLORS.azure} radius={[3,3,0,0]} name="azure" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Radar Chart ─────────────────────────────────────────────────────
function ProviderRadar({ data }) {
  if (!data || !data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid stroke="#e2e8f5" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#64748b' }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
        <Radar name="AWS"   dataKey="aws"   stroke={COLORS.aws}   fill={COLORS.aws}   fillOpacity={0.18} strokeWidth={2} />
        <Radar name="GCP"   dataKey="gcp"   stroke={COLORS.gcp}   fill={COLORS.gcp}   fillOpacity={0.18} strokeWidth={2} />
        <Radar name="Azure" dataKey="azure" stroke={COLORS.azure} fill={COLORS.azure} fillOpacity={0.18} strokeWidth={2} />
        <Legend />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Budget Analysis ─────────────────────────────────────────────────
function BudgetAnalysis({ budgets }) {
  if (!budgets) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {['aws', 'gcp', 'azure'].map(p => {
        const b = budgets[p] || {};
        const statusColor = BUDGET_COLOR[b.status] || '#64748b';
        return (
          <div key={p}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS[p], textTransform: 'uppercase' }}>{p}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{b.pct ?? 0}% used</span>
            </div>
            <div style={{ height: 8, background: '#f0f4ff', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{
                width: `${Math.min(b.pct ?? 0, 100)}%`,
                height: '100%',
                background: statusColor,
                borderRadius: 4,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
              <span>{fmt(b.spend)} spent</span>
              <span>{fmt(b.remaining)} remaining of {fmt(b.limit)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Savings Recommendations ──────────────────────────────────────────
function SavingsRecommendations({ recs }) {
  if (!recs || !recs.length) return <div style={{ color: '#94a3b8', fontSize: 12 }}>No recommendations found.</div>;

  const totalSavings = recs.reduce((s, r) => s + (r.savings || 0), 0);

  return (
    <div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
        Total potential savings: <strong style={{ color: '#22c55e' }}>{fmt(totalSavings)}/mo</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recs.map(r => (
          <div key={r.id} style={{
            padding: '12px 14px',
            border: `1px solid ${PRIORITY_COLOR[r.priority] || '#e2e8f5'}33`,
            borderLeft: `3px solid ${PRIORITY_COLOR[r.priority] || '#e2e8f5'}`,
            borderRadius: 8,
            background: '#fafbff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Badge label={r.priority} color={PRIORITY_COLOR[r.priority] || '#64748b'} />
                  <Badge label={r.provider?.toUpperCase()} color={COLORS[r.provider] || '#64748b'} />
                  <Badge label={r.effort} color="#64748b" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 3 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{r.desc}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{fmt(r.savings)}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>/ month</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cross-Service Table ──────────────────────────────────────────────
// Shows real service names exactly as named in the user's cloud platform
// e.g. "Prod_EC2" instead of generic "Amazon EC2"
function CrossServiceTable({ rows, isLive }) {
  if (!rows || !rows.length) return <div style={{ color: '#94a3b8', fontSize: 12 }}>No service data available.</div>;
  return (
    <div>
      {isLive && (
        <div style={{ marginBottom: 10, display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
          <span style={{ background:'#22c55e22', color:'#22c55e', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>
            LIVE SERVICE NAMES
          </span>
          <span style={{ color:'#64748b' }}>Names fetched directly from your cloud platform accounts</span>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8faff' }}>
              {['Provider', 'Service Name (from cloud)', 'Monthly Cost', 'Daily Cost', '% of Provider'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Provider' || h.startsWith('Service') ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #e2e8f5', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f4ff' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: COLORS[r.provider?.toLowerCase()] || '#374151' }}>{r.provider}</td>
                <td style={{ padding: '8px 10px', color: '#374151', maxWidth: 220, fontFamily: 'monospace', fontSize: 11 }}>
                  <span title={`Exact name as set in ${r.provider} console`}>{r.service}</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#1a1a2e' }}>{fmt(r.monthly)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>{r.daily ? `$${r.daily}` : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <span style={{ background: '#f0f4ff', color: '#64748b', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                    {r.pct_of_provider?.toFixed(0) ?? 0}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isLive && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
          Connect cloud accounts to see exact service names as defined in your cloud consoles.
        </div>
      )}
    </div>
  );
}

// ─── Summary Banner ───────────────────────────────────────────────────
function SummaryBanner({ summary }) {
  if (!summary) return null;
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12,
      padding: '14px 18px',
      background: 'linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)',
      borderRadius: 10,
      border: '1px solid #e2e8f5',
      marginBottom: 18,
    }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>TOTAL MTD (ALL CLOUDS)</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e' }}>{fmt(summary.total_mtd)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>TOTAL SAVINGS POTENTIAL</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#22c55e' }}>{fmt(summary.total_savings_potential)}<span style={{ fontSize: 13, fontWeight: 500 }}>/mo</span></div>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>MOST COST EFFICIENT</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: COLORS[summary.most_cost_efficient] || '#1a1a2e' }}>
          {summary.most_cost_efficient?.toUpperCase() ?? '—'}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>HIGHEST SAVINGS OPP.</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: COLORS[summary.highest_savings_potential] || '#1a1a2e' }}>
          {summary.highest_savings_potential?.toUpperCase() ?? '—'}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────
export default function CostComparisonPanel({ mode = 'mock' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCostComparison(mode);
      setData(res);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load cost comparison');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      Loading cost comparison data…
    </div>
  );

  if (error) return (
    <div className="error-banner" style={{ margin: '12px 0' }}>{error}</div>
  );

  if (!data) return null;

  const SUB_TABS = [
    { id: 'overview',    label: 'Overview'      },
    { id: 'radar',       label: 'Performance'    },
    { id: 'savings',     label: 'Savings'        },
    { id: 'services',    label: 'All Services'   },
  ];

  return (
    <div>
      {/* Summary Banner */}
      <SummaryBanner summary={data.summary} />

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18, borderBottom: '2px solid #e2e8f5', paddingBottom: 0 }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #4285F4' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === t.id ? '#4285F4' : '#64748b',
              fontWeight: activeTab === t.id ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: -2,
              borderRadius: '4px 4px 0 0',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={load}
          style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 12, border: '1px solid #e2e8f5', borderRadius: 6, background: '#f8faff', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      {/* Overview: 3 provider cards */}
      {activeTab === 'overview' && (
        <div>
          <ProviderSummaryCards providers={data.providers} summary={data.summary} />
          <div style={{ marginTop: 18 }}>
            <Card>
              <SectionTitle>Multi-Cloud Cost Comparison — Monthly Side-by-Side</SectionTitle>
              <MonthlyComparisonChart data={data.monthly_comparison} />
            </Card>
          </div>
        </div>
      )}

      {/* Radar / Performance */}
      {activeTab === 'radar' && (
        <div className="two-col" style={{ gap: 14 }}>
          <Card>
            <SectionTitle>Provider Performance Radar</SectionTitle>
            <ProviderRadar data={data.radar} />
          </Card>
          <Card>
            <SectionTitle>Efficiency Scores</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 8 }}>
              {['aws', 'gcp', 'azure'].map(p => {
                const info = data.providers[p] || {};
                return (
                  <div key={p}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, color: COLORS[p], textTransform: 'uppercase', fontSize: 12 }}>{p}</span>
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#1a1a2e' }}>{info.efficiency_score ?? '—'}<span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>/100</span></span>
                    </div>
                    <div style={{ height: 10, background: '#f0f4ff', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${info.efficiency_score ?? 0}%`, height: '100%', background: `linear-gradient(90deg, ${COLORS[p]}, ${COLORS[p]}88)`, borderRadius: 6, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: '#94a3b8' }}>
                      <span>Cost/Service: {fmt(info.cost_per_service)}</span>
                      <span>Savings: {fmt(info.savings_potential)}/mo</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Savings Recommendations */}
      {activeTab === 'savings' && (
        <Card>
          <SectionTitle>Cost Savings Recommendations</SectionTitle>
          <SavingsRecommendations recs={data.savings_recommendations} />
        </Card>
      )}

      {/* All Services — real names + specs from cloud platforms */}
      {activeTab === 'services' && (
        <Card>
          <SectionTitle>All Services — Real Names &amp; Specs from Cloud</SectionTitle>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            Resource names are fetched exactly as you named them on each cloud platform. Click any row to see full specs.
          </div>
          <AllServicesTable mode={mode} />
        </Card>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
        Last updated: {data.generated_at}
      </div>
    </div>
  );
}
