import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ProviderLogo from './ProviderLogo';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/* ─── per-provider field schemas ─── */
const SCHEMAS = {
  aws: {
    label: 'AWS', color: '#FF9900', bg: '#FFF4E0',
    description: 'Connect your Amazon Web Services account to pull live billing, EC2, S3, RDS, and Lambda data.',
    authTypes: [
      {
        id: 'iam',
        label: 'IAM User',
        sublabel: 'Recommended — least privilege access',
        fields: [
          { id: 'access_key_id',     label: 'Access Key ID',     type: 'text',     placeholder: 'AKIAIOSFODNN7EXAMPLE',  hint: 'Found in IAM → Users → Security credentials' },
          { id: 'secret_access_key', label: 'Secret Access Key', type: 'password', placeholder: '••••••••••••••••••••••••',hint: 'Shown once at creation time' },
          { id: 'region',            label: 'Default Region',    type: 'select',   placeholder: 'us-east-1',
            options: ['us-east-1','us-east-2','us-west-1','us-west-2','eu-west-1','eu-central-1','ap-south-1','ap-southeast-1','ap-northeast-1'] },
          { id: 'session_token',     label: 'Session Token',     type: 'password', placeholder: 'Optional — for temporary credentials', optional: true },
        ],
      },
      {
        id: 'root',
        label: 'Root Account',
        sublabel: 'Not recommended for production',
        fields: [
          { id: 'access_key_id',     label: 'Root Access Key ID',     type: 'text',     placeholder: 'AKIAIOSFODNN7EXAMPLE' },
          { id: 'secret_access_key', label: 'Root Secret Access Key', type: 'password', placeholder: '••••••••••••••••••••••••' },
          { id: 'region',            label: 'Default Region',         type: 'select',   placeholder: 'us-east-1',
            options: ['us-east-1','us-east-2','us-west-1','us-west-2','eu-west-1','eu-central-1','ap-south-1','ap-southeast-1','ap-northeast-1'] },
        ],
        warning: 'Root credentials have full account access. Consider using an IAM user with read-only Cost Explorer permissions instead.',
      },
    ],
  },
  gcp: {
    label: 'GCP', color: '#4285F4', bg: '#E8F0FE',
    description: 'Connect your Google Cloud Platform project to pull live Compute Engine, BigQuery, GKE, and billing data.',
    authTypes: [
      {
        id: 'service_account',
        label: 'Service Account',
        sublabel: 'Recommended — fine-grained IAM roles',
        fields: [
          { id: 'project_id',          label: 'Project ID',                type: 'text',     placeholder: 'my-gcp-project-123456' },
          { id: 'service_account_json',label: 'Service Account JSON Key',  type: 'textarea', placeholder: '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}', hint: 'Paste full JSON from GCP Console → IAM → Service Accounts → Keys' },
        ],
      },
      {
        id: 'root',
        label: 'Owner / Root',
        sublabel: 'User account with Owner role',
        fields: [
          { id: 'project_id',          label: 'Project ID',                type: 'text',     placeholder: 'my-gcp-project-123456' },
          { id: 'service_account_json',label: 'Owner Service Account JSON',type: 'textarea', placeholder: '{\n  "type": "service_account",\n  ...\n}' },
        ],
        warning: 'Owner role grants full project access. Use a read-only service account with Billing Viewer and Viewer roles for security.',
      },
    ],
  },
  azure: {
    label: 'Azure', color: '#008AD7', bg: '#E0F2FF',
    description: 'Connect your Microsoft Azure subscription to pull live VM, Blob Storage, AKS, and cost management data.',
    authTypes: [
      {
        id: 'service_principal',
        label: 'Service Principal',
        sublabel: 'Recommended — app-based RBAC access',
        fields: [
          { id: 'subscription_id', label: 'Subscription ID', type: 'text',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Azure Portal → Subscriptions' },
          { id: 'tenant_id',       label: 'Tenant ID',       type: 'text',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Azure Portal → Azure Active Directory → Overview' },
          { id: 'client_id',       label: 'Client ID',       type: 'text',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'App Registration → Application (client) ID' },
          { id: 'client_secret',   label: 'Client Secret',   type: 'password', placeholder: '••••••••••••••••••••••••', hint: 'App Registration → Certificates & secrets' },
        ],
      },
      {
        id: 'root',
        label: 'Root / Owner',
        sublabel: 'Full subscription owner credentials',
        fields: [
          { id: 'subscription_id', label: 'Subscription ID', type: 'text',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          { id: 'tenant_id',       label: 'Tenant ID',       type: 'text',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          { id: 'client_id',       label: 'Client ID',       type: 'text',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          { id: 'client_secret',   label: 'Client Secret',   type: 'password', placeholder: '••••••••••••••••••••••••' },
        ],
        warning: 'Owner role has full subscription access. Consider Billing Reader + Reader roles for a monitoring-only principal.',
      },
    ],
  },
};

/* ─── Step indicator ─── */
function StepDot({ n, label, state }) {
  const bg = state === 'done' ? '#22c55e' : state === 'active' ? '#4285F4' : 'rgba(0,0,0,0.12)';
  const textColor = state === 'active' ? '#fff' : state === 'done' ? '#fff' : 'rgba(0,0,0,0.35)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', background:bg, color:textColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, transition:'background 0.3s', flexShrink:0 }}>
        {state === 'done' ? '✓' : n}
      </div>
      <span style={{ fontSize:12, color: state === 'active' ? 'var(--text)' : 'var(--text3)', fontWeight: state === 'active' ? 500 : 400, whiteSpace:'nowrap' }}>{label}</span>
    </div>
  );
}

/* ─── Single provider connect card ─── */
function ProviderConnectCard({ provider, status, onConnect, onDisconnect }) {
  const schema = SCHEMAS[provider];
  const [expanded, setExpanded]     = useState(false);
  const [authType, setAuthType]     = useState(schema.authTypes[0].id);
  const [fields, setFields]         = useState({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError]           = useState('');
  const [showJson, setShowJson]     = useState(false);

  const authSchema = schema.authTypes.find(a => a.id === authType);

  function setField(id, val) { setFields(f => ({ ...f, [id]: val })); }

  async function handleConnect() {
    setError('');
    // Validate required fields
    for (const f of authSchema.fields) {
      if (!f.optional && !fields[f.id]?.trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    setConnecting(true);
    try {
      const payload = { provider, auth_type: authType, credentials: fields };
      const res = await axios.post(`${BASE}/api/credentials/connect`, payload);
      if (res.data.success) {
        onConnect(provider, res.data);
        setExpanded(false);
      } else {
        setError(res.data.error || 'Connection failed. Check your credentials and try again.');
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not reach backend. Is the server running?');
    } finally {
      setConnecting(false);
    }
  }

  const isConnected = status?.connected;

  return (
    <div className="connect-card" style={{ borderColor: isConnected ? schema.color : undefined }}>
      {/* Header */}
      <div className="connect-card-header" onClick={() => !isConnected && setExpanded(v => !v)}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className="connect-provider-icon" style={{ background: schema.bg }}>
            <ProviderLogo provider={provider} size={22} />
          </div>
          <div>
            <div className="connect-provider-name">{schema.label}</div>
            <div className="connect-provider-desc">{isConnected ? `Connected · ${status.account_id || status.project || status.subscription || ''}` : schema.description.split('.')[0]}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {isConnected
            ? <div className="conn-status-badge connected">✓ Connected</div>
            : <div className="conn-status-badge">{expanded ? 'Cancel ↑' : 'Connect +'}</div>
          }
          {isConnected && (
            <button className="disconnect-btn" onClick={e => { e.stopPropagation(); onDisconnect(provider); }}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Expanded form */}
      {expanded && !isConnected && (
        <div className="connect-form">
          {/* Auth type selector */}
          <div className="auth-type-row">
            {schema.authTypes.map(at => (
              <button
                key={at.id}
                className={`auth-type-btn ${authType === at.id ? 'active' : ''}`}
                style={{ '--accent': schema.color }}
                onClick={() => { setAuthType(at.id); setFields({}); setError(''); }}
              >
                <div>
                  <div className="auth-type-label">{at.label}</div>
                  <div className="auth-type-sub">{at.sublabel}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Warning for root */}
          {authSchema.warning && (
            <div className="cred-warning">{authSchema.warning}</div>
          )}

          {/* Fields */}
          <div className="cred-fields">
            {authSchema.fields.map(f => (
              <div key={f.id} className="cred-field">
                <label className="cred-label">
                  {f.label}
                  {f.optional && <span className="optional-tag">optional</span>}
                </label>
                {f.type === 'select' ? (
                  <select
                    className="cred-input"
                    value={fields[f.id] || ''}
                    onChange={e => setField(f.id, e.target.value)}
                  >
                    <option value="">Select region…</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <div style={{ position:'relative' }}>
                    <textarea
                      className="cred-input cred-textarea"
                      placeholder={f.placeholder}
                      value={fields[f.id] || ''}
                      onChange={e => setField(f.id, e.target.value)}
                      spellCheck={false}
                    />
                    <button
                      className="paste-btn"
                      onClick={async () => {
                        try { const t = await navigator.clipboard.readText(); setField(f.id, t); } catch {}
                      }}
                    >Paste</button>
                  </div>
                ) : (
                  <input
                    className="cred-input"
                    type={f.type === 'password' && showJson ? 'text' : f.type}
                    placeholder={f.placeholder}
                    value={fields[f.id] || ''}
                    onChange={e => setField(f.id, e.target.value)}
                    autoComplete="off"
                  />
                )}
                {f.hint && <div className="cred-hint">{f.hint}</div>}
              </div>
            ))}
          </div>

          {error && <div className="cred-error">{error}</div>}

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16 }}>
            <label className="show-toggle">
              <input type="checkbox" checked={showJson} onChange={e => setShowJson(e.target.checked)} />
              <span>Show values</span>
            </label>
            <div style={{ display:'flex', gap:8 }}>
              <button className="cred-cancel-btn" onClick={() => { setExpanded(false); setError(''); }}>Cancel</button>
              <button
                className="cred-connect-btn"
                style={{ background: schema.color }}
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? <><span className="btn-spinner" /> Connecting…</> : `Connect ${schema.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected info */}
      {isConnected && status.services_count && (
        <div className="connected-info">
          <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e', display:'inline-block', flexShrink:0 }} />
            {status.services_count} services detected
          </span>
          <span>·</span>
          <span>Region: {status.region || status.location || 'global'}</span>
          <span>·</span>
          <span>Auth: {status.auth_type}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Main modal ─── */
export default function CloudConnectModal({ open, onClose, onAllConnected, initialConnections }) {
  const [connections, setConnections] = useState(initialConnections || {});
  const overlayRef = useRef();

  useEffect(() => { setConnections(initialConnections || {}); }, [initialConnections]);

  if (!open) return null;

  const providers = ['aws', 'gcp', 'azure'];
  const connectedCount = providers.filter(p => connections[p]?.connected).length;
  const allConnected = connectedCount === 3;

  function handleConnect(provider, data) {
    setConnections(prev => ({ ...prev, [provider]: { connected: true, ...data } }));
  }
  function handleDisconnect(provider) {
    setConnections(prev => ({ ...prev, [provider]: { connected: false } }));
  }
  function handleProceed() {
    onAllConnected(connections);
    onClose();
  }

  const steps = [
    { label: 'Switch to Real mode', state: 'done' },
    { label: 'Connect cloud accounts', state: connectedCount > 0 ? (allConnected ? 'done' : 'active') : 'active' },
    { label: 'Live data streams in', state: allConnected ? 'active' : 'pending' },
  ];

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={e => e.target === overlayRef.current && onClose()}>
      <div className="modal-box">
        {/* Modal header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">Connect Cloud Accounts</div>
            <div className="modal-subtitle">Link your AWS, GCP, and Azure accounts to stream live billing and usage data.</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Step progress */}
        <div className="modal-steps">
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <StepDot n={i+1} label={s.label} state={s.state} />
              {i < steps.length - 1 && <div className="step-line" style={{ background: s.state === 'done' ? '#22c55e' : 'rgba(0,0,0,0.1)' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Connection counter */}
        <div className="modal-counter">
          <div className="counter-dots">
            {providers.map(p => (
              <div key={p} className="counter-dot" style={{ background: connections[p]?.connected ? SCHEMAS[p].color : 'rgba(0,0,0,0.12)' }}>
                {connections[p]?.connected && '✓'}
              </div>
            ))}
          </div>
          <span className="counter-text">{connectedCount}/3 accounts connected</span>
        </div>

        {/* Provider cards */}
        <div className="modal-providers">
          {providers.map(p => (
            <ProviderConnectCard
              key={p}
              provider={p}
              status={connections[p]}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="security-note">
            Credentials are sent only to your local backend server and never stored in the browser.
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="modal-cancel-btn" onClick={onClose}>
              {connectedCount > 0 ? 'Use connected accounts' : 'Cancel'}
            </button>
            <button
              className="modal-proceed-btn"
              disabled={connectedCount === 0}
              onClick={handleProceed}
              style={{ opacity: connectedCount === 0 ? 0.45 : 1 }}
            >
              {allConnected ? 'Launch Real Dashboard' : connectedCount > 0 ? `Continue with ${connectedCount} account${connectedCount>1?'s':''}` : 'Connect at least one account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
