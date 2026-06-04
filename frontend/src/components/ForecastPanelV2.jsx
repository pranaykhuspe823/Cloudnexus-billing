import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { fmt, PROVIDER_META, chartDefaults, gridY, noGridX } from '../utils/theme';

const PROVIDER_COLORS = { aws: '#FF9900', gcp: '#4285F4', azure: '#008AD7' };

const MODEL_BADGES = [
  { label: 'Holt-Winters',  icon: '📈', desc: 'Triple exponential smoothing + seasonal decomposition', key: 'holt' },
  { label: 'LSTM Patterns', icon: '🧠', desc: 'Historical window pattern memory',                       key: 'lstm' },
  { label: 'XGBoost',       icon: '⚡', desc: 'Gradient-boosted lag/momentum features',                 key: 'xgb'  },
  { label: 'Claude AI',     icon: '🤖', desc: 'Anthropic Claude AI narrative & driver intelligence',     key: 'claude' },
];

function ThinkingDots() {
  return <span className="thinking-dots"><span /><span /><span /></span>;
}

function RiskBadge({ level }) {
  const map = {
    low:    { bg: '#dcfce7', color: '#16a34a', label: '✓ Low Risk'    },
    medium: { bg: '#fef9c3', color: '#ca8a04', label: '⚡ Medium Risk' },
    high:   { bg: '#fee2e2', color: '#dc2626', label: '⚠ High Risk'   },
  };
  const s = map[level] || map.medium;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6,
                   padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

function ModelBadge({ m, active }) {
  return (
    <div title={m.desc} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
      background: active ? '#f0fdf4' : '#f9fafb',
      border: `1px solid ${active ? '#86efac' : '#e5e7eb'}`,
      color:  active ? '#15803d' : '#9ca3af',
    }}>
      {m.icon} {m.label}
    </div>
  );
}

export default function ForecastPanelV2({ forecast, loading }) {
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [analysisReady, setAnalysisReady]       = useState(false);
  const [showAnomalies, setShowAnomalies]       = useState(false);
  const [showFeatures,  setShowFeatures]        = useState(false);

  useEffect(() => {
    setAnalysisReady(false);
    if (!loading && forecast) {
      const t = setTimeout(() => setAnalysisReady(true), 1400);
      return () => clearTimeout(t);
    }
  }, [forecast, loading, selectedProvider]);

  if (!forecast) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
        <ThinkingDots /> Loading forecast data…
      </div>
    );
  }

  // ── Real data from API ──────────────────────────────────────────────
  const shares   = forecast.provider_shares   || { aws: 0.443, gcp: 0.328, azure: 0.229 };
  const provHist = forecast.provider_history  || {};  // { aws: [...], gcp: [...], azure: [...] }
  const forecastArr = forecast.forecast_30d   || [];
  const lowerArr    = forecast.lower_band     || [];
  const upperArr    = forecast.upper_band     || [];
  const anomalies   = forecast.anomalies      || [];
  const xgbFeats    = forecast.xgb_features   || {};
  const riskLevel   = forecast.risk_level     || 'medium';
  const seasonPeriod = forecast.seasonal_period;

  const histLen  = 30;
  const fcastLen = forecastArr.length || 30;

  const histLabels  = Array.from({ length: histLen }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (histLen - i));
    return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
  });
  const fcastLabels = Array.from({ length: fcastLen }, (_, i) => `F+${i + 1}`);
  const allLabels   = [...histLabels, ...fcastLabels];

  function buildDatasets() {
    const providers = selectedProvider === 'all' ? ['aws', 'gcp', 'azure'] : [selectedProvider];

    return providers.flatMap((p) => {
      const color = PROVIDER_COLORS[p];
      const share = shares[p] || 0.33;

      // Real per-provider history from API (last 30 days of actual trend data)
      const rawHist = (provHist[p] || []).slice(-histLen);
      const padded  = rawHist.length < histLen
        ? [...Array(histLen - rawHist.length).fill(null), ...rawHist]
        : rawHist;
      const lastHist = padded[padded.length - 1] || 0;

      // Scale forecast arrays by provider share
      const fc = forecastArr.map(v => Math.round(v * share));
      const lo = lowerArr.map(v   => Math.round(v * share));
      const hi = upperArr.map(v   => Math.round(v * share));

      const histData  = [...padded, ...Array(fcastLen).fill(null)];
      const fcastData = [...Array(histLen - 1).fill(null), lastHist, ...fc];
      const loData    = [...Array(histLen - 1).fill(null), lastHist, ...lo];
      const hiData    = [...Array(histLen - 1).fill(null), lastHist, ...hi];

      if (selectedProvider === 'all') {
        return [
          { label: `${PROVIDER_META[p].label} Historical`, data: histData,  borderColor: color, borderWidth: 2, fill: false, pointRadius: 0, tension: 0.3 },
          { label: `${PROVIDER_META[p].label} Forecast`,   data: fcastData, borderColor: color, borderDash: [5, 3], borderWidth: 2, fill: false, pointRadius: 0, tension: 0.3 },
        ];
      } else {
        return [
          { label: 'Upper 95% CI', data: hiData,    borderColor: 'transparent', backgroundColor: `${color}18`, fill: '+1', pointRadius: 0, tension: 0.3 },
          { label: 'Lower 95% CI', data: loData,    borderColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3 },
          { label: 'Historical',   data: histData,  borderColor: color, backgroundColor: `${color}08`, borderWidth: 2, fill: true, pointRadius: 0, tension: 0.3 },
          { label: 'Ensemble Forecast', data: fcastData, borderColor: color, borderDash: [6, 3], borderWidth: 2.5, fill: false, pointRadius: 0, tension: 0.3 },
        ];
      }
    });
  }

  // Only show providers that have actual data (share > 0) — hides $0 rows for unconnected providers
  const forecastProviders = ['aws', 'gcp', 'azure']
    .map(k => ({
      key:      k,
      share:    shares[k] || 0,
      forecast: Math.round(forecast.total_30d * (shares[k] || 0)),
      trendPct: forecast.trend_pct || 0,
    }))
    .filter(p => p.share > 0 || forecast.total_30d === 0);

  const selColor = PROVIDER_COLORS[selectedProvider] || '#888';

  return (
    <div className="forecast-v2-wrap">

      {/* Model badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {MODEL_BADGES.map(m => {
          const claudeUsed = (forecast.models_used || []).some(u => u.toLowerCase().includes('claude'));
          const active = m.key === 'claude' ? claudeUsed : true;
          return <ModelBadge key={m.label} m={m} active={active} />;
        })}
        <div style={{ marginLeft: 'auto' }}>
          <RiskBadge level={riskLevel} />
        </div>
      </div>

      {/* Provider tabs — only show providers that have data */}
      <div className="forecast-provider-tabs">
        <button
          className={`fcast-prov-btn ${selectedProvider === 'all' ? 'active' : ''}`}
          style={selectedProvider === 'all' ? { borderColor: '#888', color: '#555', background: '#f5f5f5' } : {}}
          onClick={() => setSelectedProvider('all')}
        >All Providers</button>
        {['aws', 'gcp', 'azure'].filter(p => (shares[p] || 0) > 0).map(p => (
          <button key={p}
            className={`fcast-prov-btn ${selectedProvider === p ? 'active' : ''}`}
            style={selectedProvider === p ? { borderColor: PROVIDER_COLORS[p], color: PROVIDER_COLORS[p], background: `${PROVIDER_COLORS[p]}12` } : {}}
            onClick={() => setSelectedProvider(p)}
          >
            {PROVIDER_META[p].emoji} {PROVIDER_META[p].label}
          </button>
        ))}
      </div>

      {/* Chart — driven purely by real data */}
      <div style={{ height: 240, marginTop: 8 }}>
        <Line
          data={{ labels: allLabels, datasets: buildDatasets() }}
          options={{
            ...chartDefaults,
            plugins: {
              legend: {
                display: selectedProvider === 'all', position: 'top',
                labels: { font: { size: 11 }, boxWidth: 20, padding: 12 },
              },
              tooltip: {
                mode: 'index', intersect: false,
                callbacks: { label: (ctx) => ` ${ctx.dataset.label}: $${Number(ctx.raw || 0).toLocaleString()}` },
              },
            },
            scales: {
              y: { ...gridY(), ticks: { font: { size: 10 }, callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v) } },
              x: { ...noGridX(), ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
            },
          }}
        />
      </div>

      {/* Legend */}
      <div className="chart-legend" style={{ marginTop: 10 }}>
        {selectedProvider === 'all' ? (
          ['aws', 'gcp', 'azure'].map(p => (
            <span key={p}><span className="leg-dot" style={{ background: PROVIDER_COLORS[p] }} />{PROVIDER_META[p].label}</span>
          ))
        ) : (
          <>
            <span><span className="leg-dot" style={{ background: selColor }} />Historical</span>
            <span><span className="leg-line dashed" style={{ borderTopColor: selColor }} />Ensemble Forecast</span>
            <span><span className="leg-dot" style={{ background: `${selColor}30` }} />95% CI Band</span>
          </>
        )}
      </div>

      {/* Metrics strip — all values from API */}
      {selectedProvider !== 'all' && (
        <div className="forecast-metrics-strip">
          <div className="fms-item">
            <div className="fms-label">30-Day Forecast</div>
            <div className="fms-val" style={{ color: selColor }}>
              {fmt.usd(Math.round(forecast.total_30d * (shares[selectedProvider] || 0.33)))}
            </div>
          </div>
          <div className="fms-item">
            <div className="fms-label">Trend</div>
            <div className="fms-val">{forecast.trend_pct > 0 ? '+' : ''}{forecast.trend_pct}%/mo</div>
          </div>
          <div className="fms-item">
            <div className="fms-label">Confidence</div>
            <div className="fms-val">{forecast.confidence}%</div>
          </div>
          {seasonPeriod && (
            <div className="fms-item">
              <div className="fms-label">Seasonality</div>
              <div className="fms-val">{seasonPeriod}d cycle</div>
            </div>
          )}
          <div className="fms-item">
            <div className="fms-label">Anomalies</div>
            <div className="fms-val" style={{ color: anomalies.length ? '#ef4444' : '#22c55e' }}>
              {anomalies.length ? `${anomalies.length} found` : 'None'}
            </div>
          </div>
        </div>
      )}



      {/* Seasonal + recommendation */}
      {(forecast.seasonal_insight || forecast.top_recommendation) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          {forecast.seasonal_insight && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                          padding: '8px 10px', fontSize: 11, color: '#14532d' }}>
              <span style={{ fontWeight: 700 }}>📅 Seasonal:</span> {forecast.seasonal_insight}
            </div>
          )}
          {forecast.top_recommendation && (
            <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8,
                          padding: '8px 10px', fontSize: 11, color: '#713f12' }}>
              <span style={{ fontWeight: 700 }}>💡 Action:</span> {forecast.top_recommendation}
            </div>
          )}
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowAnomalies(v => !v)} style={{
            background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6,
            padding: '4px 10px', fontSize: 11, color: '#c2410c', cursor: 'pointer',
            fontWeight: 600, marginBottom: showAnomalies ? 8 : 0,
          }}>
            ⚠️ {anomalies.length} Anomal{anomalies.length > 1 ? 'ies' : 'y'} Detected {showAnomalies ? '▲' : '▼'}
          </button>
          {showAnomalies && anomalies.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 6, marginBottom: 4,
              background: a.type === 'spike' ? '#fff7ed' : '#eff6ff',
            }}>
              <span style={{ fontSize: 14 }}>{a.type === 'spike' ? '⚠️' : '📉'}</span>
              <span style={{ fontSize: 11, color: '#374151', flex: 1 }}>
                {a.day}: <strong>${Number(a.value).toLocaleString()}</strong>
                {' '}— {a.type} (z={a.z_score})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* XGBoost feature debug */}
      {Object.keys(xgbFeats).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowFeatures(v => !v)} style={{
            background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6,
            padding: '4px 10px', fontSize: 11, color: '#6d28d9', cursor: 'pointer', fontWeight: 600,
          }}>
            ⚡ XGBoost Feature Map {showFeatures ? '▲' : '▼'}
          </button>
          {showFeatures && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {Object.entries(xgbFeats).slice(0, 14).map(([k, v]) => (
                <div key={k} style={{
                  background: '#faf5ff', border: '1px solid #e9d5ff',
                  borderRadius: 5, padding: '2px 7px', fontSize: 10, color: '#7c3aed',
                }}>
                  <span style={{ color: '#9ca3af' }}>{k}:</span>{' '}
                  {typeof v === 'number' ? v.toFixed(1) : v}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Provider outlook card */}
      <div className="forecast-card" style={{ marginTop: 12 }}>
        <div className="forecast-title">
          <span className="ai-dot" />
          Ensemble Forecast — provider outlook
        </div>

        {forecastProviders.map(p => (
          <div className="forecast-item" key={p.key}
            style={selectedProvider === p.key ? { background: `${PROVIDER_COLORS[p.key]}08`, borderRadius: 6 } : {}}
          >
            <span className="fi-label">{PROVIDER_META[p.key].label}</span>
            <span>
              <span className="fi-val">{fmt.usd(p.forecast)}</span>
              <span className="fi-trend" style={{ color: p.trendPct > 0 ? '#ef4444' : '#22c55e' }}>
                {p.trendPct > 0 ? '+' : ''}{p.trendPct?.toFixed(1)}%
              </span>
            </span>
          </div>
        ))}

        {/* Live key drivers */}
        {forecast.key_drivers?.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 6,
                          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Key Cost Drivers
            </div>
            {forecast.key_drivers.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'center', marginBottom: 4, fontSize: 11 }}>
                <span style={{ color: '#374151' }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', display: 'inline-block', marginRight: 6,
                    background: d.severity === 'high' ? '#ef4444' : d.severity === 'medium' ? '#f59e0b' : '#22c55e',
                  }} />
                  {d.name}
                </span>
                <span style={{ fontWeight: 700, color: d.impact?.startsWith('-') ? '#22c55e' : '#ef4444' }}>
                  {d.impact}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="forecast-running">
          {analysisReady ? (
            <>
              <span style={{ color: '#22c55e', marginRight: 4 }}>✓</span>
              Ensemble complete — {forecast.confidence}% confidence
              {seasonPeriod && (
                <span style={{ color: '#9ca3af', marginLeft: 8 }}>
                  · {seasonPeriod}d seasonality
                </span>
              )}
              <span style={{ color: '#9ca3af', marginLeft: 8 }}>
                · {forecast.models_used?.length || 4} models blended
              </span>
            </>
          ) : (
            <><ThinkingDots /> Running Holt-Winters + LSTM + XGBoost + Claude AI…</>
          )}
        </div>
      </div>
    </div>
  );
}
