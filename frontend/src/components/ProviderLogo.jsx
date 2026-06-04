import React from 'react';
import { PROVIDER_META } from '../utils/theme';

export default function ProviderLogo({ provider, size = 16 }) {
  const meta = PROVIDER_META[provider] || {};
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} title={meta.label || provider}>
      {meta.emoji || '☁️'}
    </span>
  );
}
