import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE });

export const fetchOverview    = (mode) => api.get(`/api/overview?mode=${mode}`).then(r => r.data);
export const fetchProvider    = (p, mode) => api.get(`/api/provider/${p}?mode=${mode}`).then(r => r.data);
export const fetchTrend       = (mode, days=7) => api.get(`/api/trend?mode=${mode}&days=${days}`).then(r => r.data);
export const fetchForecast    = (mode) => api.get(`/api/forecast?mode=${mode}`).then(r => r.data);
export const fetchAlerts      = (mode) => api.get(`/api/alerts?mode=${mode}`).then(r => r.data);
export const exportCSV        = (mode) => { window.open(`${BASE}/api/export/csv?mode=${mode}`, '_blank'); };
export const exportJSON       = (mode) => { window.open(`${BASE}/api/export/json?mode=${mode}`, '_blank'); };
export const fetchInvoices     = (provider, mode) => api.get(`/api/invoices/${provider}?mode=${mode}`).then(r => r.data);
export const fetchMonthlyTrend = (mode) => api.get(`/api/trend/monthly?mode=${mode}`).then(r => r.data);

export const fetchCostComparison = (mode) => api.get(`/api/cost-comparison?mode=${mode}`).then(r => r.data);
export const fetchNamedResources = (mode) => api.get(`/api/resources/named?mode=${mode}`).then(r => r.data);
