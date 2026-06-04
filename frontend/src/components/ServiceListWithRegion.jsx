import React, { useState } from 'react';
import { PROVIDER_META, fmt } from '../utils/theme';

const ICONS = {
  server: '🖥️', database: '🗄️', bucket: '📦', function: '⚡', cdn: '🌐',
  analytics: '📊', kubernetes: '☸️', run: '🏃', vm: '💻', blob: '🗂️',
  app: '🌐', default: '☁️',
};

const REGION_DATA = {
  aws: {
    'us-east-1': [
      { name: 'EC2', cost: 4120, pct: 44, status: 'healthy', icon: 'server' },
      { name: 'RDS', cost: 2100, pct: 22, status: 'healthy', icon: 'database' },
      { name: 'S3',  cost: 1600, pct: 17, status: 'healthy', icon: 'bucket' },
      { name: 'Lambda', cost: 980, pct: 10, status: 'healthy', icon: 'function' },
    ],
    'us-west-2': [
      { name: 'EC2', cost: 1800, pct: 45, status: 'warning', icon: 'server' },
      { name: 'CloudFront', cost: 1240, pct: 31, status: 'warning', icon: 'cdn' },
      { name: 'S3', cost: 940, pct: 24, status: 'healthy', icon: 'bucket' },
    ],
    'eu-west-1': [
      { name: 'EC2', cost: 1500, pct: 60, status: 'healthy', icon: 'server' },
      { name: 'RDS', cost: 712, pct: 28, status: 'healthy', icon: 'database' },
      { name: 'Lambda', cost: 300, pct: 12, status: 'healthy', icon: 'function' },
    ],
    'ap-southeast-1': [
      { name: 'EC2', cost: 700, pct: 58, status: 'healthy', icon: 'server' },
      { name: 'S3', cost: 400, pct: 33, status: 'healthy', icon: 'bucket' },
      { name: 'Lambda', cost: 112, pct: 9, status: 'healthy', icon: 'function' },
    ],
  },
  gcp: {
    'us-central1': [
      { name: 'Compute Engine', cost: 3200, pct: 55, status: 'healthy', icon: 'server' },
      { name: 'BigQuery', cost: 1820, pct: 31, status: 'healthy', icon: 'analytics' },
      { name: 'Cloud SQL', cost: 800, pct: 14, status: 'healthy', icon: 'database' },
    ],
    'us-east1': [
      { name: 'GKE', cost: 2490, pct: 61, status: 'healthy', icon: 'kubernetes' },
      { name: 'Cloud Run', cost: 620, pct: 15, status: 'healthy', icon: 'run' },
      { name: 'BigQuery', cost: 1010, pct: 24, status: 'healthy', icon: 'analytics' },
    ],
    'europe-west1': [
      { name: 'Compute Engine', cost: 1400, pct: 50, status: 'healthy', icon: 'server' },
      { name: 'Cloud SQL', cost: 710, pct: 25, status: 'warning', icon: 'database' },
      { name: 'BigQuery', cost: 700, pct: 25, status: 'healthy', icon: 'analytics' },
    ],
    'asia-east1': [
      { name: 'Compute Engine', cost: 820, pct: 62, status: 'healthy', icon: 'server' },
      { name: 'Cloud Run', cost: 310, pct: 24, status: 'healthy', icon: 'run' },
      { name: 'Cloud SQL', cost: 180, pct: 14, status: 'healthy', icon: 'database' },
    ],
  },
  azure: {
    'East US': [
      { name: 'Virtual Machines', cost: 2200, pct: 56, status: 'warning', icon: 'vm' },
      { name: 'AKS', cost: 980, pct: 25, status: 'healthy', icon: 'kubernetes' },
      { name: 'Azure SQL', cost: 760, pct: 19, status: 'healthy', icon: 'database' },
    ],
    'West Europe': [
      { name: 'Virtual Machines', cost: 1140, pct: 48, status: 'healthy', icon: 'vm' },
      { name: 'Blob Storage', cost: 890, pct: 38, status: 'healthy', icon: 'blob' },
      { name: 'App Service', cost: 340, pct: 14, status: 'healthy', icon: 'app' },
    ],
    'Southeast Asia': [
      { name: 'Virtual Machines', cost: 600, pct: 54, status: 'healthy', icon: 'vm' },
      { name: 'AKS', cost: 330, pct: 30, status: 'healthy', icon: 'kubernetes' },
      { name: 'App Service', cost: 180, pct: 16, status: 'healthy', icon: 'app' },
    ],
    'UK South': [
      { name: 'Blob Storage', cost: 600, pct: 60, status: 'healthy', icon: 'blob' },
      { name: 'Azure SQL', cost: 250, pct: 25, status: 'healthy', icon: 'database' },
      { name: 'App Service', cost: 150, pct: 15, status: 'healthy', icon: 'app' },
    ],
  },
};

export default function ServiceListWithRegion({ provider, services }) {
  const meta = PROVIDER_META[provider];
  const [activeRegion, setActiveRegion] = useState(null);

  const regions = REGION_DATA[provider] ? Object.keys(REGION_DATA[provider]) : [];
  const displayServices = activeRegion
    ? (REGION_DATA[provider]?.[activeRegion] || [])
    : (services || []);

  return (
    <div>
      {/* Region Filter Bar */}
      {regions.length > 0 && (
        <div className="region-bar">
          <span className="region-bar-label">📍 Region</span>
          <button
            className={`region-btn ${!activeRegion ? 'active' : ''}`}
            style={!activeRegion ? { borderColor: meta.color, color: meta.color, background: `${meta.color}12` } : {}}
            onClick={() => setActiveRegion(null)}
          >
            All
          </button>
          {regions.map(r => (
            <button
              key={r}
              className={`region-btn ${activeRegion === r ? 'active' : ''}`}
              style={activeRegion === r ? { borderColor: meta.color, color: meta.color, background: `${meta.color}12` } : {}}
              onClick={() => setActiveRegion(r === activeRegion ? null : r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {activeRegion && (
        <div className="region-active-label" style={{ color: meta.color }}>
          Showing services in <strong>{activeRegion}</strong>
        </div>
      )}

      <div className="service-list">
        {displayServices.map(s => (
          <div className="service-row" key={s.name}>
            <span className="svc-emoji">{ICONS[s.icon] || ICONS.default}</span>
            <span className="svc-name">{s.name}</span>
            <div className="svc-bar-wrap">
              <div className="svc-bar" style={{ width: `${s.pct}%`, background: meta.color }} />
            </div>
            <span className="svc-cost">{fmt.usd(s.cost)}</span>
            <span className="svc-status-dot" style={{
              background: s.status === 'healthy' ? '#22c55e' : '#eab308'
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}
