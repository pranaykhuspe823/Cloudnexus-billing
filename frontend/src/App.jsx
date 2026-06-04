import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCloudData } from './hooks/useCloudData';
import AlertService from './services/alertService';
import Topbar from './components/Topbar';
import CloudConnectModal from './components/CloudConnectModal';
import ProviderCard from './components/ProviderCard';
import ServiceListWithRegion from './components/ServiceListWithRegion';
import MetricRow from './components/MetricRow';
import UtilizationBars from './components/UtilizationBars';
import ForecastPanelV2 from './components/ForecastPanelV2';
import AlertList from './components/AlertList';
import InvoicePanel from './components/InvoicePanel';
import {
  TrendChart, DistChart, ProviderBarChart, AzureHorizontalChart
} from './components/Charts';
import { fmt } from './utils/theme';
import './App.css';

import CrossCloudAnalysis from './components/CrossCloudAnalysis';
import CostComparisonPanel from './components/CostComparisonPanel';
import ProviderLogo from './components/ProviderLogo';
import { fetchMonthlyTrend } from './services/api';

const TABS = ['overview','aws','gcp','azure','analysis','forecast','invoices','alerts'];


// ── Monthly Spend Table — fetches real data from /api/trend/monthly ──
function MonthlyOverviewTable({ mode }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMonthlyTrend(mode);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load monthly data');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      ⏳ Fetching month-wise spend from cloud platforms…
    </div>
  );
  if (error) return (
    <div style={{ padding: 12, color: '#ef4444', fontSize: 13 }}>⚠️ {error}</div>
  );
  if (!data) return null;

  // Build rows from API response
  let rows = [];
  if (data.months && data.months.length) {
    // From /api/trend/monthly grouped format
    rows = data.months.map(m => ({
      month: m.month || m.label || '',
      aws:   m.aws   || 0,
      gcp:   m.gcp   || 0,
      azure: m.azure || 0,
      total: m.total || (m.aws + m.gcp + m.azure) || 0,
    }));
  } else if (data.aws && data.aws.length) {
    // Live AWS-only format: { source:'live', aws: [{month,total},...] }
    rows = data.aws.map(m => ({
      month: m.month,
      aws:   m.total || 0,
      gcp:   0,
      azure: 0,
      total: m.total || 0,
    }));
  }

  if (!rows.length) return (
    <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>No month-wise data available yet.</div>
  );

  const maxTotal = Math.max(...rows.map(r => r.total), 1);
  const isLive   = data.source === 'live' || data.source === 'real';

  return (
    <div>
      {isLive && (
        <div style={{ marginBottom: 10, display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
          <span style={{ background:'#22c55e22', color:'#22c55e', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>
            🔌 LIVE DATA
          </span>
          <span style={{ color:'#64748b' }}>Fetched directly from your connected cloud platforms</span>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8faff' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #e2e8f5' }}>Month</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#FF9900', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #e2e8f5' }}>AWS</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#4285F4', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #e2e8f5' }}>GCP</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#008AD7', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #e2e8f5' }}>Azure</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #e2e8f5' }}>Combined</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f5', width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f4ff' }}>
                <td style={{ padding: '9px 10px', fontWeight: 600, color: '#1a1a2e' }}>{r.month}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#FF9900', fontWeight: 500 }}>{fmt.usd(Math.round(r.aws))}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#4285F4', fontWeight: 500 }}>{fmt.usd(Math.round(r.gcp))}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#008AD7', fontWeight: 500 }}>{fmt.usd(Math.round(r.azure))}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#1a1a2e' }}>{fmt.usd(Math.round(r.total))}</td>
                <td style={{ padding: '9px 10px' }}>
                  <div style={{ height: 8, background: '#f0f4ff', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.total / maxTotal) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #4285F4, #FF9900)', borderRadius: 4 }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
        {isLive ? '✅ Real data from cloud APIs' : '⚠️ Connect cloud accounts for live month-wise data'}
      </div>
    </div>
  );
}


// ── AWS Real Metrics Cards ────────────────────────────────────────────
function AWSRealMetricCards({ providers, mode }) {
  const aws = providers.aws;
  if (!aws) return null;

  const isReal = mode === 'real';
  const metrics = aws.metrics || {};

  const cards = [
    {
      label: 'AWS MTD Spend',
      value: fmt.usd(aws.mtd),
      sub: fmt.pct(aws.delta_pct),
      color: 'var(--color-danger)',
      detail: isReal ? '🔌 Live from AWS Cost Explorer' : '⚠️ Connect AWS for live data',
      liveColor: isReal ? '#22c55e' : '#f97316',
    },
    {
      label: 'EC2 Instances',
      value: metrics.instances != null ? fmt.num(metrics.instances) : '—',
      sub: 'running instances',
      detail: isReal
        ? (metrics.instances != null
          ? '🔌 Live from AWS EC2 DescribeInstances'
          : '⚠️ Requires ec2:DescribeInstances permission')
        : '⚠️ Connect AWS for real instance count',
      liveColor: isReal && metrics.instances != null ? '#22c55e' : '#f97316',
    },
    {
      label: 'S3 Storage',
      value: metrics.storage_tb != null ? `${metrics.storage_tb} TB` : '—',
      sub: metrics.storage_cost ? `${fmt.usd(metrics.storage_cost)}/mo` : 'estimated from billing',
      detail: isReal
        ? '🔌 Live from AWS Cost Explorer (S3 billing)'
        : '⚠️ Connect AWS for real S3 usage',
      liveColor: isReal && metrics.storage_tb != null ? '#22c55e' : '#f97316',
    },
    {
      label: 'Lambda Invocations',
      value: metrics.lambda_invocations != null ? fmt.abbr(metrics.lambda_invocations) : '—',
      sub: 'this month',
      detail: isReal
        ? (metrics.lambda_invocations > 0
          ? '🔌 Live from CloudWatch Lambda/Invocations'
          : '⚠️ Requires cloudwatch:GetMetricStatistics permission')
        : '⚠️ Connect AWS for real Lambda data',
      liveColor: isReal && metrics.lambda_invocations > 0 ? '#22c55e' : '#f97316',
    },
  ];

  return (
    <div className="metric-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: '#fff',
          border: '1px solid #e2e8f5',
          borderRadius: 10,
          padding: '16px 18px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>{c.label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: c.color || '#1a1a2e', lineHeight: 1.1 }}>{c.value}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{c.sub}</div>
          <div style={{
            marginTop: 8,
            fontSize: 10,
            color: c.liveColor,
            fontWeight: 600,
            padding: '2px 0',
            borderTop: '1px solid #f0f4ff',
            paddingTop: 6,
          }}>{c.detail}</div>
        </div>
      ))}
    </div>
  );
}


export default function App() {
  const [tab,              setTab]              = useState('overview');
  const [mode,             setMode]             = useState('mock');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [connections,      setConnections]      = useState({});
  const [managedAlerts,    setManagedAlerts]    = useState([]);

  const alertSvc = useRef(new AlertService());

  const { overview, providers, trend, forecast, alerts, loading, error, refresh, lastRefresh } =
    useCloudData(mode);

  // Sync backend alerts into alertService and convert to unified schema
  useEffect(() => {
    const svc = alertSvc.current;
    svc.clear();
    svc.addProviderAlerts((alerts || []).map(a => ({
      id:           String(a.id),
      title:        a.title,
      message:      a.detail || a.message || '',
      severity:     a.type === 'danger' ? 'critical' : (a.type || 'info'),
      provider:     a.provider,
      service:      a.title,
      time:         a.time,
      acknowledged: a.resolved || false,
      autoGenerated: false,
    })));
    setManagedAlerts(svc.getAll());
  }, [alerts]);

  function handleAcknowledge(alertId) {
    alertSvc.current.acknowledge(alertId);
    setManagedAlerts([...alertSvc.current.getAll()]);
  }

  function handleOpenConnect() { setModalOpen(true); }

  function handleAllConnected(conns) {
    setConnections(conns);
    const anyConnected = Object.values(conns).some(c => c.connected);
    if (anyConnected) setMode('real');
  }

  function handleModeChange(m) {
    if (m === 'mock') setMode('mock');
  }

  const connectedProviders = Object.entries(connections)
    .filter(([, v]) => v.connected)
    .map(([k]) => k);

  // In real mode only show charts/data for actually connected providers.
  // In mock mode show all three.
  const activeProviders = (mode === 'real' && connectedProviders.length > 0)
    ? connectedProviders
    : ['aws', 'gcp', 'azure'];

  const connectedCount = connectedProviders.length;
  const overviewMetrics = overview ? [
    { label: 'Total MTD Spend',    value: fmt.usd(overview.total_mtd),       sub: mode === 'real' ? `${connectedCount} provider${connectedCount !== 1 ? 's' : ''} connected` : 'estimated',  color:'var(--color-danger)'  },
    { label: 'Active Services',    value: fmt.num(overview.active_services),  sub: mode === 'real' ? 'live from cloud APIs' : 'across 3 providers'                                            },
    { label: '30-Day Forecast',    value: fmt.usd(overview.forecast_30d),     sub: '↑ projected overage',                                                                                      color:'var(--color-warning)' },
    { label: 'Cost Savings Found', value: fmt.usd(overview.savings_found),    sub: 'by AI optimizer',                                                                                          color:'var(--color-success)' },
  ] : [];

  const gcpIsEstimated  = providers.gcp?._is_estimated;
  const gcpNotConnected = providers.gcp?._not_connected;
  const gcpMetrics = providers.gcp ? [
    { label: 'GCP MTD',
      value: gcpNotConnected ? '—' : fmt.usd(providers.gcp.mtd),
      sub:   gcpNotConnected ? 'not connected' : gcpIsEstimated ? 'estimated (BigQuery required)' : fmt.pct(providers.gcp.delta_pct),
      color: 'var(--color-success)' },
    { label: 'GCE Instances',
      value: gcpNotConnected ? '—' : fmt.num(providers.gcp.metrics?.instances),
      sub:   gcpNotConnected ? 'not connected' : gcpIsEstimated ? 'estimated' : 'running' },
    { label: 'BigQuery Scanned',
      value: gcpNotConnected ? '—' : `${providers.gcp.metrics?.bigquery_tb} TB`,
      sub:   gcpNotConnected ? 'not connected' : gcpIsEstimated ? 'estimated' : `${fmt.usd(providers.gcp.metrics?.bigquery_cost)}/mo` },
    { label: 'GKE Pods',
      value: gcpNotConnected ? '—' : fmt.num(providers.gcp.metrics?.gke_pods),
      sub:   gcpNotConnected ? 'not connected' : gcpIsEstimated ? 'estimated' : 'running' },
  ] : [];

  const azureNotConnected = providers.azure?._not_connected;
  const azureIsLive       = providers.azure?._is_live;
  const azureMetrics = providers.azure ? [
    { label: 'Azure MTD',
      value: azureNotConnected ? '—' : fmt.usd(providers.azure.mtd),
      sub:   azureNotConnected ? 'not connected' : fmt.pct(providers.azure.delta_pct),
      color: 'var(--color-warning)' },
    { label: 'VMs Running',
      value: azureNotConnected ? '—' : fmt.num(providers.azure.metrics?.vms),
      sub:   azureNotConnected ? 'not connected' : azureIsLive ? 'live from Azure Compute' : 'estimated' },
    { label: 'Blob Storage',
      value: azureNotConnected ? '—' : `${providers.azure.metrics?.storage_tb} TB`,
      sub:   azureNotConnected ? 'not connected' : `${fmt.usd(providers.azure.metrics?.storage_cost)}/mo` },
    { label: 'AKS Nodes',
      value: azureNotConnected ? '—' : fmt.num(providers.azure.metrics?.aks_nodes),
      sub:   azureNotConnected ? 'not connected' : azureIsLive ? 'live from AKS' : 'estimated' },
  ] : [];

  const forecastMetrics = forecast ? [
    { label: '30-day Total Forecast', value: fmt.usd(forecast.total_30d),
      sub: `Trend: ${forecast.trend_pct > 0 ? '+' : ''}${forecast.trend_pct}%/mo`,
      color: 'var(--color-warning)' },
    { label: 'Model Confidence',      value: `${forecast.confidence}%`,
      sub: `${forecast.models_used?.length || 4} models blended` },
    { label: 'Key Driver',            value: forecast.key_drivers?.[0]?.name || '—',
      sub: forecast.key_drivers?.[0]?.impact || '' },
    { label: 'Risk Level',            value: (forecast.risk_level || 'medium').toUpperCase(),
      sub: `${forecast.anomalies?.length || 0} anomalies detected`,
      color: forecast.risk_level === 'high' ? 'var(--color-danger)' : forecast.risk_level === 'low' ? 'var(--color-success)' : 'var(--color-warning)' },
  ] : [];

  const reportData = { overview, providers, trend, forecast };

  return (
    <div className="app">
      {mode === 'real' && connectedProviders.length > 0 && (
        <div className="mode-banner">
          🔌 Real mode — live data from: {connectedProviders.map(p => p.toUpperCase()).join(', ')}.
          Unconnected providers show mock data.{' '}
          <span style={{ cursor:'pointer', textDecoration:'underline' }} onClick={() => setModalOpen(true)}>
            Manage connections
          </span>
        </div>
      )}

      <Topbar
        mode={mode}
        onModeChange={handleModeChange}
        onRefresh={refresh}
        lastRefresh={lastRefresh}
        connections={connections}
        onOpenConnect={handleOpenConnect}
        reportData={reportData}
      />

      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'alerts'
              ? <>{t} <span className="alert-badge">{managedAlerts.filter(a => !a.acknowledged).length || 0}</span></>
              : t === 'invoices' ? '🧾 invoices' : t
            }
          </button>
        ))}
      </div>

      {loading && <div className="loading-bar"><div className="loading-fill" /></div>}
      {error   && <div className="error-banner">⚠️ {error} — showing cached data</div>}

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <>
          <MetricRow metrics={overviewMetrics} />
          <div className="provider-grid">
            {['aws','gcp','azure'].map(p => (
              <ProviderCard
                key={p} provider={p}
                data={overview?.providers?.[p]}
                selected={selectedProvider === p}
                onClick={() => setSelectedProvider(p === selectedProvider ? null : p)}
                notConnected={mode === 'real' && !!(overview?.providers?.[p]?._not_connected)}
              />
            ))}
          </div>
          <div className="two-col">
            <div className="section-card">
              <div className="section-title">
                📈 7-day spend trend —{' '}
                {mode === 'real' && connectedProviders.length > 0
                  ? connectedProviders.map(p => p.toUpperCase()).join(' + ')
                  : 'all providers'}
              </div>
              <TrendChart data={trend.slice(-7)} activeProviders={activeProviders} />
              <div className="chart-legend">
                {activeProviders.includes('aws')   && <span><span className="leg-dot" style={{background:'#FF9900'}}/>AWS</span>}
                {activeProviders.includes('gcp')   && <span><span className="leg-dot" style={{background:'#4285F4'}}/>GCP</span>}
                {activeProviders.includes('azure') && <span><span className="leg-dot" style={{background:'#008AD7'}}/>Azure</span>}
              </div>
            </div>
            <div className="section-card">
              <div className="section-title">🍩 Cost distribution</div>
              <DistChart overview={overview} activeProviders={activeProviders} />
            </div>
          </div>
          <div className="three-col">
            {['aws','gcp','azure'].map(p => {
              const isActive = activeProviders.includes(p);
              const notConnected = providers[p]?._not_connected;
              return (
                <div className="section-card" key={p}>
                  <div className="section-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <ProviderLogo provider={p} size={14} /> Top {p.toUpperCase()} services
                    {mode === 'real' && notConnected && (
                      <span style={{ marginLeft:8, fontSize:10, color:'#94a3b8', fontWeight:400 }}>
                        — not connected
                      </span>
                    )}
                  </div>
                  {mode === 'real' && notConnected ? (
                    <div style={{ fontSize:12, color:'#94a3b8', padding:'12px 0' }}>
                      Connect {p.toUpperCase()} to see live service costs.
                    </div>
                  ) : (
                    <ServiceListWithRegion provider={p} services={providers[p]?.services} />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Month-wise Spend Table — live from cloud APIs ── */}
          <div className="section-card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div className="section-title" style={{ marginBottom:0 }}>📅 Month-wise Spend — All Providers</div>
              {mode !== 'real' && (
                <button
                  onClick={() => setModalOpen(true)}
                  style={{ fontSize:11, padding:'4px 12px', border:'1px solid #4285F4', borderRadius:6, background:'#f0f7ff', color:'#4285F4', cursor:'pointer', fontWeight:600 }}
                >
                  🔌 Connect for Live Data
                </button>
              )}
            </div>
            <MonthlyOverviewTable mode={mode} />
          </div>
        </>
      )}

      {/* ── AWS ── */}
      {tab === 'aws' && (
        <>
          {/* Real metric cards with live data indicators */}
          <AWSRealMetricCards providers={providers} mode={mode} />

          {mode === 'real' && connections.aws?.connected && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#14532d', display:'flex', alignItems:'center', gap:8 }}>
              🔌 <strong>Live AWS data</strong> — costs from Cost Explorer, instance counts from EC2, Lambda from CloudWatch.
            </div>
          )}

          {mode !== 'real' && (
            <div style={{ background:'#fff8ed', border:'1px solid #f97316', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#92400e', display:'flex', alignItems:'center', gap:8 }}>
              ⚠️ Showing estimated data. <strong>Connect your AWS account</strong> to see real EC2 instance counts, actual S3 usage, and live Lambda invocations.
              <button onClick={() => setModalOpen(true)} style={{ marginLeft:'auto', padding:'4px 12px', border:'1px solid #f97316', borderRadius:6, background:'#fff8ed', color:'#f97316', cursor:'pointer', fontWeight:600, fontSize:11 }}>
                Connect AWS →
              </button>
            </div>
          )}

          <div className="two-col">
            <div className="section-card">
              <div className="section-title">📊 AWS — daily cost by service</div>
              <ProviderBarChart data={providers.aws?.daily} color="#FF9900" label="AWS Daily Cost" />
            </div>
            <div className="section-card">
              <div className="section-title">⚙️ Resource utilization</div>
              <UtilizationBars provider="aws" utilization={providers.aws?.utilization} />
            </div>
          </div>
          <div className="section-card">
            <div className="section-title" style={{ display:'flex', alignItems:'center', gap:6 }}><ProviderLogo provider="aws" size={14} /> All AWS services — by region</div>
            <ServiceListWithRegion provider="aws" services={providers.aws?.services} />
          </div>
        </>
      )}

      {/* ── GCP ── */}
      {tab === 'gcp' && (
        <>
          {mode === 'real' && connections.gcp?.connected && providers.gcp?._is_estimated && (
            <div style={{ background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#1e40af', display:'flex', alignItems:'center', gap:8 }}>
              ℹ️ GCP is connected but cost data requires <strong>BigQuery billing export</strong>.
              Showing <strong>estimated figures</strong> — enable BigQuery export in your GCP project for live cost data.
            </div>
          )}
          {mode === 'real' && connections.gcp?.connected && !providers.gcp?._is_estimated && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#14532d', display:'flex', alignItems:'center', gap:8 }}>
              🔌 <strong>Live GCP data</strong> — costs and instances fetched from Google Cloud APIs.
            </div>
          )}
          {mode === 'real' && !connections.gcp?.connected && (
            <div style={{ background:'#fff8ed', border:'1px solid #f97316', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#92400e', display:'flex', alignItems:'center', gap:8 }}>
              ⚠️ Showing estimated data. <strong>Connect your GCP account</strong> to see real Compute Engine instance counts and BigQuery usage.
              <button onClick={() => setModalOpen(true)} style={{ marginLeft:'auto', padding:'4px 12px', border:'1px solid #f97316', borderRadius:6, background:'#fff8ed', color:'#f97316', cursor:'pointer', fontWeight:600, fontSize:11 }}>
                Connect GCP →
              </button>
            </div>
          )}
          <MetricRow metrics={gcpMetrics} />
          {gcpNotConnected ? (
            <div style={{ padding:'32px 0', textAlign:'center', color:'#94a3b8', fontSize:13 }}>
              Connect your GCP account to see spend charts, service breakdown, and resource utilization.
              <div style={{ marginTop:12 }}>
                <button onClick={() => setModalOpen(true)} style={{ padding:'8px 20px', border:'1px solid #4285F4', borderRadius:8, background:'#f0f7ff', color:'#4285F4', cursor:'pointer', fontWeight:700, fontSize:12 }}>
                  Connect GCP →
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="two-col">
                <div className="section-card">
                  <div className="section-title">📈 GCP — 14-day spend{gcpIsEstimated && <span style={{marginLeft:6,fontSize:10,color:'#94a3b8'}}>(estimated)</span>}</div>
                  <ProviderBarChart data={providers.gcp?.daily} color="#4285F4" label="GCP Daily Cost" />
                </div>
                <div className="section-card">
                  <div className="section-title">⚙️ Resource utilization</div>
                  <UtilizationBars provider="gcp" utilization={providers.gcp?.utilization} />
                </div>
              </div>
              <div className="section-card">
                <div className="section-title" style={{ display:'flex', alignItems:'center', gap:6 }}><ProviderLogo provider="gcp" size={14} /> All GCP services — by region</div>
                <ServiceListWithRegion provider="gcp" services={providers.gcp?.services} />
              </div>
            </>
          )}
        </>
      )}

      {/* ── AZURE ── */}
      {tab === 'azure' && (
        <>
          {mode === 'real' && connections.azure?.connected && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#14532d', display:'flex', alignItems:'center', gap:8 }}>
              🔌 <strong>Live Azure data</strong> — costs and VMs fetched directly from Azure Cost Management API.
            </div>
          )}
          {mode === 'real' && !connections.azure?.connected && (
            <div style={{ background:'#fff8ed', border:'1px solid #f97316', borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:12, color:'#92400e', display:'flex', alignItems:'center', gap:8 }}>
              ⚠️ Showing estimated data. <strong>Connect your Azure account</strong> to see real VM counts, actual costs, and live spend trends.
              <button onClick={() => setModalOpen(true)} style={{ marginLeft:'auto', padding:'4px 12px', border:'1px solid #f97316', borderRadius:6, background:'#fff8ed', color:'#f97316', cursor:'pointer', fontWeight:600, fontSize:11 }}>
                Connect Azure →
              </button>
            </div>
          )}
          <MetricRow metrics={azureMetrics} />
          {azureNotConnected ? (
            <div style={{ padding:'32px 0', textAlign:'center', color:'#94a3b8', fontSize:13 }}>
              Connect your Azure account to see spend charts, service breakdown, and resource utilization.
              <div style={{ marginTop:12 }}>
                <button onClick={() => setModalOpen(true)} style={{ padding:'8px 20px', border:'1px solid #008AD7', borderRadius:8, background:'#f0f7ff', color:'#008AD7', cursor:'pointer', fontWeight:700, fontSize:12 }}>
                  Connect Azure →
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="two-col">
                <div className="section-card">
                  <div className="section-title">📊 Azure — resource cost breakdown</div>
                  <AzureHorizontalChart services={providers.azure?.services} />
                </div>
                <div className="section-card">
                  <div className="section-title">⚙️ Resource utilization</div>
                  <UtilizationBars provider="azure" utilization={providers.azure?.utilization} />
                </div>
              </div>
              <div className="section-card">
                <div className="section-title" style={{ display:'flex', alignItems:'center', gap:6 }}><ProviderLogo provider="azure" size={14} /> All Azure services — by region</div>
                <ServiceListWithRegion provider="azure" services={providers.azure?.services} />
              </div>
            </>
          )}
        </>
      )}

      {/* ── ANALYSIS ── */}
      {tab === 'analysis' && (
        <div>
          {/* Cost Comparison Section */}
          <div className="section-card">
            <div className="section-title">⚖️ Multi-Cloud Cost Comparison</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, marginBottom: 16 }}>
              Side-by-side provider breakdown, budget tracking, savings recommendations, performance radar, and full cross-service cost table.
            </div>
            <CostComparisonPanel mode={mode} />
          </div>

          {/* Cross-Cloud FinOps Analysis Section */}
          <div className="section-card" style={{ marginTop: 14 }}>
            <div className="section-title">🧭 Cross-Cloud FinOps Analysis</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              Shows connected cloud services (best-effort), per-day and per-month cost estimates, plus actionable tips.
            </div>
            <div style={{ marginTop: 12 }}>
              <CrossCloudAnalysis />
            </div>
          </div>
        </div>
      )}

      {/* ── FORECAST ── */}
      {tab === 'forecast' && (
        <>
          <MetricRow metrics={forecastMetrics} />
          <div className="section-card">
            <div className="section-title">📈 90-day history + 30-day ensemble forecast</div>
            <ForecastPanelV2 forecast={forecast} loading={loading} />
          </div>
        </>
      )}

      {/* ── INVOICES ── */}
      {tab === 'invoices' && (
        <div className="section-card">
          <div className="section-title">🧾 Cloud Provider Invoices</div>
          <InvoicePanel mode={mode} />
        </div>
      )}

      {/* ── ALERTS ── */}
      {tab === 'alerts' && (
        <div className="section-card">
          <div className="section-title">⚠️ Active anomalies &amp; alerts</div>
          <AlertList alerts={managedAlerts} onAcknowledge={handleAcknowledge} />
        </div>
      )}

      <CloudConnectModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          const anyConn = Object.values(connections).some(c => c.connected);
          if (!anyConn) setMode('mock');
        }}
        onAllConnected={handleAllConnected}
        initialConnections={connections}
      />
    </div>
  );
}
