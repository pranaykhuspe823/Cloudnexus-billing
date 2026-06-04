import React, { useState, useRef, useEffect } from 'react';
import { exportCSV, exportJSON } from '../services/api';
import { exportReport, exportReportAsPDF, exportSeparatePDFs } from '../utils/reportExport';

const PROVIDER_COLORS = { aws: '#FF9900', gcp: '#4285F4', azure: '#008AD7' };

export default function Topbar({ mode, onModeChange, onRefresh, lastRefresh, connections, onOpenConnect, reportData }) {
  const [dlOpen, setDlOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [pdfSub, setPdfSub] = useState(false);
  const ref = useRef();

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) { setDlOpen(false); setPdfSub(false); } }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleRefresh() {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 800);
  }

  function timeAgo() {
    if (!lastRefresh) return 'never';
    const s = Math.floor((Date.now() - lastRefresh) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  }

  function handleModeToggle(m) {
    if (m === 'real') {
      onOpenConnect();
    } else {
      onModeChange('mock');
    }
  }

  function handleExportHTML(filter) {
    if (reportData) exportReport({ ...reportData, filter });
    setDlOpen(false); setPdfSub(false);
  }

  function handleExportPDF(filter) {
    if (reportData) exportReportAsPDF({ ...reportData, filter });
    setDlOpen(false); setPdfSub(false);
  }

  function handleExportAllPDFs() {
    if (reportData) exportSeparatePDFs({ ...reportData });
    setDlOpen(false); setPdfSub(false);
  }

  const connectedCount = ['aws','gcp','azure'].filter(p => connections?.[p]?.connected).length;

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="logo">Cloud<span style={{ color: '#4285F4' }}>Nexus</span></span>
        <span className="live-badge"><span className="dot" />Live</span>
        <span className="muted-text">Last refresh: {timeAgo()}</span>
      </div>

      <div className="topbar-right">
        {mode === 'real' && (
          <div className="conn-pills">
            {['aws','gcp','azure'].map(p => (
              <div
                key={p}
                className={`conn-pill ${connections?.[p]?.connected ? 'connected' : 'disconnected'}`}
                onClick={onOpenConnect}
                style={{ cursor:'pointer' }}
                title={connections?.[p]?.connected ? `${p.toUpperCase()} connected` : `${p.toUpperCase()} — click to connect`}
              >
                <span style={{ width:6, height:6, borderRadius:'50%', background: connections?.[p]?.connected ? PROVIDER_COLORS[p] : 'rgba(0,0,0,0.2)', display:'inline-block' }} />
                {p.toUpperCase()}
              </div>
            ))}
          </div>
        )}

        <div className="mode-toggle">
          <button className={`mode-btn ${mode === 'mock' ? 'active' : ''}`} onClick={() => handleModeToggle('mock')}>Mock</button>
          <button className={`mode-btn ${mode === 'real' ? 'active' : ''}`} onClick={() => handleModeToggle('real')}>
            Real {mode === 'real' && connectedCount > 0 && <span style={{fontSize:10,marginLeft:3,opacity:0.8}}>{connectedCount}/3</span>}
          </button>
        </div>


        <div className="dl-wrapper" ref={ref}>
          <button className="icon-btn" onClick={() => { setDlOpen(v => !v); setPdfSub(false); }}>↓ Export</button>
          {dlOpen && (
            <div className="dl-panel" style={{ minWidth: 260 }}>

              {/* ── HTML Reports ── */}
              <div className="dl-section-label">📊 HTML Reports</div>
              <div className="dl-option" onClick={() => handleExportHTML('combined')}>
                <span>📋</span><div><div>Full Report (All Providers)</div><div className="dl-sub">AWS + GCP + Azure · HTML</div></div>
              </div>
              <div className="dl-option" onClick={() => handleExportHTML('aws')}>
                <span>🟠</span><div><div>AWS Report</div><div className="dl-sub">Amazon Web Services · HTML</div></div>
              </div>
              <div className="dl-option" onClick={() => handleExportHTML('gcp')}>
                <span>🔵</span><div><div>GCP Report</div><div className="dl-sub">Google Cloud · HTML</div></div>
              </div>
              <div className="dl-option" onClick={() => handleExportHTML('azure')}>
                <span>🔷</span><div><div>Azure Report</div><div className="dl-sub">Microsoft Azure · HTML</div></div>
              </div>

              <div className="dl-divider" />

              {/* ── PDF Reports ── */}
              <div className="dl-section-label" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>📄 PDF Reports</span>
                <span style={{ fontSize:9, color:'#94a3b8', fontWeight:400 }}>via Print dialog</span>
              </div>
              <div className="dl-option" onClick={() => handleExportPDF('combined')}>
                <span>📑</span><div><div style={{fontWeight:600}}>Combined PDF — All Providers</div><div className="dl-sub">AWS + GCP + Azure · month-wise + charts</div></div>
              </div>
              <div className="dl-option" onClick={() => handleExportPDF('aws')}>
                <span style={{color:'#FF9900'}}>⬛</span><div><div>AWS PDF Report</div><div className="dl-sub">Amazon Web Services only</div></div>
              </div>
              <div className="dl-option" onClick={() => handleExportPDF('gcp')}>
                <span style={{color:'#4285F4'}}>⬛</span><div><div>GCP PDF Report</div><div className="dl-sub">Google Cloud only</div></div>
              </div>
              <div className="dl-option" onClick={() => handleExportPDF('azure')}>
                <span style={{color:'#008AD7'}}>⬛</span><div><div>Azure PDF Report</div><div className="dl-sub">Microsoft Azure only</div></div>
              </div>
              <div className="dl-option" onClick={handleExportAllPDFs} style={{ background:'rgba(66,133,244,0.05)', borderRadius:6 }}>
                <span>📦</span><div><div style={{fontWeight:600, color:'#4285F4'}}>Export All 3 Separate PDFs</div><div className="dl-sub">One PDF per provider</div></div>
              </div>

              <div className="dl-divider" />

              {/* ── Raw Data ── */}
              <div className="dl-section-label">📁 Raw Data</div>
              <div className="dl-option" onClick={() => { exportCSV(mode); setDlOpen(false); }}>📄 Export CSV</div>
              <div className="dl-option" onClick={() => { exportJSON(mode); setDlOpen(false); }}>📦 Export JSON</div>
            </div>
          )}
        </div>
        <button className={`icon-btn ${spinning ? 'spin' : ''}`} onClick={handleRefresh} title="Refresh">↻</button>
      </div>
    </div>
  );
}
