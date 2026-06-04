from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json, io, csv
import os
import smtplib
from dotenv import load_dotenv

load_dotenv()
from datetime import datetime, timedelta
from email.message import EmailMessage
from time import time
from typing import Optional, Dict, Any
import threading
try:
    from forecaster import run_forecast
except ModuleNotFoundError:
    # When running with different PYTHONPATH, support package-style import
    from .forecaster import run_forecast

try:
    from mock_data import get_mock_data
    from real_data import get_real_data, connect_aws, connect_gcp, connect_azure
    from optimizer import analyze_cross_cloud
except ModuleNotFoundError:
    from .mock_data import get_mock_data
    from .real_data import get_real_data, connect_aws, connect_gcp, connect_azure
    from .optimizer import analyze_cross_cloud



app = FastAPI(title="CloudNexus API v2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_credentials: Dict[str, Dict] = {}
_real_data_cache = None
_real_data_cache_ts = 0.0
_real_data_cache_lock = threading.Lock()
_REAL_DATA_CACHE_TTL = 30.0


def _invalidate_real_cache() -> None:
    global _real_data_cache, _real_data_cache_ts
    _real_data_cache = None
    _real_data_cache_ts = 0.0


def _get_cached_real_data() -> dict:
    global _real_data_cache, _real_data_cache_ts
    now = time()
    if _real_data_cache is not None and now - _real_data_cache_ts < _REAL_DATA_CACHE_TTL:
        return _real_data_cache
    with _real_data_cache_lock:
        now = time()
        if _real_data_cache is not None and now - _real_data_cache_ts < _REAL_DATA_CACHE_TTL:
            return _real_data_cache
        try:
            data = get_real_data(_credentials)
        except ModuleNotFoundError:
            from .real_data import get_real_data as gr
            data = gr(_credentials)
        _real_data_cache = data
        _real_data_cache_ts = now
        return data


def _get_smtp_config() -> Optional[Dict[str, Any]]:
    host = os.getenv("EMAIL_SMTP_HOST", "").strip()
    if not host:
        return None
    return {
        "host": host,
        "port": int(os.getenv("EMAIL_SMTP_PORT", "587")),
        "user": os.getenv("EMAIL_SMTP_USER", "").strip(),
        "password": os.getenv("EMAIL_SMTP_PASS", ""),
        "from_addr": os.getenv("EMAIL_FROM", os.getenv("EMAIL_SMTP_USER", "")).strip(),
        "use_tls": os.getenv("EMAIL_SMTP_USE_TLS", "true").strip().lower() not in ("false", "0", "no"),
    }


def _send_email(to_email: str, subject: str, body_text: str, body_html: str = None) -> None:
    smtp_config = _get_smtp_config()
    if not smtp_config or not smtp_config["user"] or not smtp_config["password"]:
        raise HTTPException(
            status_code=501,
            detail="Email sending is not configured. Set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASS in the backend environment.",
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_config["from_addr"]
    message["To"] = to_email
    message.set_content(body_text)
    if body_html:
        message.add_alternative(body_html, subtype="html")

    try:
        with smtplib.SMTP(smtp_config["host"], smtp_config["port"], timeout=10) as smtp:
            if smtp_config["use_tls"]:
                smtp.starttls()
            smtp.login(smtp_config["user"], smtp_config["password"])
            smtp.send_message(message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {exc}")


# ── Report email builder ──────────────────────────────────────────────

def _r_usd(n: float) -> str:
    return f"${n:,.0f}"


def _r_delta(pct: float) -> str:
    if pct > 0:
        return f'<span style="color:#c53030;font-weight:600;">&#9650; {abs(pct):.1f}%</span>'
    if pct < 0:
        return f'<span style="color:#276749;font-weight:600;">&#9660; {abs(pct):.1f}%</span>'
    return '<span style="color:#718096;">&#8212; 0%</span>'


def _r_dot(status: str) -> str:
    c = {"healthy": "#38a169", "warning": "#dd6b20", "danger": "#e53e3e"}.get(status, "#a0aec0")
    return (
        f'<span style="display:inline-block;width:7px;height:7px;border-radius:50%;'
        f'background:{c};margin-right:5px;vertical-align:middle;"></span>'
    )


def _r_bar(label: str, pct: int, color: str) -> str:
    w = min(pct, 100)
    return (
        f'<tr>'
        f'<td style="padding:3px 0;font-size:11px;color:#718096;width:76px;">{label}</td>'
        f'<td style="padding:3px 6px;">'
        f'<div style="background:#edf2f7;border-radius:3px;height:5px;width:150px;">'
        f'<div style="background:{color};height:5px;border-radius:3px;width:{w}%;"></div>'
        f'</div></td>'
        f'<td style="padding:3px 0;font-size:11px;color:#4a5568;font-weight:600;">{pct}%</td>'
        f'</tr>'
    )


def _build_report_html(data: dict) -> str:
    today  = datetime.utcnow()
    ov     = data["overview"]
    pr     = data["providers"]
    alerts = data.get("alerts", [])
    trend  = data.get("trend", [])

    today_label = today.strftime("%b %d")
    td = next((d for d in trend if d["date"] == today_label),
              trend[-1] if trend else {"aws": 0, "gcp": 0, "azure": 0, "total": 0})
    date_str = today.strftime(f"%A, %B {today.day}, %Y")

    # ── inline cell builders ──────────────────────────────────────────

    def kpi(label, val, color, last=False):
        br = "" if last else "border-right:1px solid #edf2f7;"
        return (
            f'<td style="padding:18px 22px;{br}vertical-align:top;">'
            f'<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;'
            f'color:#a0aec0;margin-bottom:6px;">{label}</div>'
            f'<div style="font-size:22px;font-weight:700;color:{color};">{val}</div>'
            f'</td>'
        )

    def today_col(label, val, color):
        return (
            f'<td style="text-align:center;padding:0 12px;border-right:1px solid #f0f0f0;">'
            f'<div style="font-size:10px;color:#a0aec0;letter-spacing:0.5px;margin-bottom:4px;">{label}</div>'
            f'<div style="font-size:17px;font-weight:700;color:{color};">{val}</div>'
            f'</td>'
        )

    def metric_cell(val, label, last=False):
        br = "" if last else "border-right:1px solid #e2e8f0;"
        return (
            f'<td style="text-align:center;padding:10px 12px;{br}">'
            f'<div style="font-size:14px;font-weight:700;color:#2d3748;">{val}</div>'
            f'<div style="font-size:10px;color:#a0aec0;margin-top:2px;">{label}</div>'
            f'</td>'
        )

    def svc_rows(services):
        out = ""
        for s in services:
            out += (
                f'<tr style="border-bottom:1px solid #f7fafc;">'
                f'<td style="padding:7px 0;font-size:12px;color:#2d3748;">{_r_dot(s["status"])}{s["name"]}</td>'
                f'<td style="padding:7px 0;font-size:12px;font-weight:600;color:#1a202c;text-align:right;">'
                f'{_r_usd(s["cost"])}</td>'
                f'<td style="padding:7px 0 7px 14px;font-size:11px;color:#a0aec0;text-align:right;">'
                f'{s["pct"]}%</td>'
                f'</tr>'
            )
        return out

    def provider_card(display, key, accent, bg, pdata, metrics_html, util_html):
        today_val = td.get(key, 0)
        return (
            f'<tr><td style="padding-bottom:14px;">'
            f'<table width="100%" cellpadding="0" cellspacing="0" '
            f'style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">'
            f'<tr><td style="border-left:4px solid {accent};padding:18px 22px 16px;">'

            # header
            f'<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">'
            f'<tr>'
            f'<td>'
            f'<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;'
            f'color:{accent};margin-bottom:4px;">{display}</div>'
            f'<div style="font-size:24px;font-weight:700;color:#1a202c;line-height:1.1;">'
            f'{_r_usd(pdata["mtd"])}</div>'
            f'<div style="font-size:11px;color:#718096;margin-top:3px;">'
            f'Month-to-date &nbsp;&middot;&nbsp; {_r_delta(pdata["delta_pct"])} vs last month</div>'
            f'</td>'
            f'<td style="text-align:right;vertical-align:top;">'
            f'<div style="font-size:10px;color:#a0aec0;margin-bottom:3px;">Today</div>'
            f'<div style="font-size:17px;font-weight:600;color:#4a5568;">{_r_usd(today_val)}</div>'
            f'</td>'
            f'</tr></table>'

            # metrics band
            f'<table width="100%" cellpadding="0" cellspacing="0" '
            f'style="background:{bg};border-radius:6px;margin-bottom:14px;">'
            f'<tr>{metrics_html}</tr></table>'

            # services table
            f'<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">'
            f'<tr style="border-bottom:1px solid #edf2f7;">'
            f'<th style="padding:5px 0;font-size:10px;font-weight:700;color:#a0aec0;'
            f'text-transform:uppercase;text-align:left;">Service</th>'
            f'<th style="padding:5px 0;font-size:10px;font-weight:700;color:#a0aec0;'
            f'text-transform:uppercase;text-align:right;">MTD Cost</th>'
            f'<th style="padding:5px 0 5px 14px;font-size:10px;font-weight:700;color:#a0aec0;'
            f'text-transform:uppercase;text-align:right;">Share</th>'
            f'</tr>'
            f'{svc_rows(pdata.get("services", []))}'
            f'</table>'

            # utilization
            f'<div style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;'
            f'color:#a0aec0;margin-bottom:7px;">Resource Utilization</div>'
            f'<table cellpadding="0" cellspacing="0">{util_html}</table>'

            f'</td></tr></table>'
            f'</td></tr>'
        )

    # ── AWS ──
    aws = pr["aws"]
    aws_m = (
        metric_cell(aws["metrics"]["instances"], "EC2 Instances") +
        metric_cell(f"{aws['metrics']['storage_tb']} TB", "S3 Storage") +
        metric_cell(f"{aws['metrics']['lambda_invocations'] // 1_000_000:.1f}M", "Lambda Calls") +
        metric_cell(_r_usd(aws["metrics"]["storage_cost"]), "Storage Cost", last=True)
    )
    aws_u = (
        _r_bar("CPU Avg",  aws["utilization"]["cpu_avg"],  "#FF9900") +
        _r_bar("Memory",   aws["utilization"]["memory"],   "#FF9900") +
        _r_bar("RDS CPU",  aws["utilization"]["rds_cpu"],  "#FF9900") +
        _r_bar("Network",  aws["utilization"]["network"],  "#FF9900")
    )

    # ── GCP ──
    gcp = pr["gcp"]
    gcp_m = (
        metric_cell(gcp["metrics"]["instances"], "Compute VMs") +
        metric_cell(f"{gcp['metrics']['bigquery_tb']} TB", "BigQuery Data") +
        metric_cell(gcp["metrics"]["gke_pods"], "GKE Pods") +
        metric_cell(_r_usd(gcp["metrics"]["bigquery_cost"]), "BigQuery Cost", last=True)
    )
    gcp_u = (
        _r_bar("CPU Avg", gcp["utilization"]["cpu_avg"], "#4285F4") +
        _r_bar("Memory",  gcp["utilization"]["memory"],  "#4285F4") +
        _r_bar("Disk",    gcp["utilization"]["disk"],    "#4285F4") +
        _r_bar("Network", gcp["utilization"]["network"], "#4285F4")
    )

    # ── Azure ──
    az = pr["azure"]
    az_m = (
        metric_cell(az["metrics"]["vms"], "Virtual Machines") +
        metric_cell(f"{az['metrics']['storage_tb']} TB", "Blob Storage") +
        metric_cell(az["metrics"]["aks_nodes"], "AKS Nodes") +
        metric_cell(_r_usd(az["metrics"]["storage_cost"]), "Storage Cost", last=True)
    )
    az_u = (
        _r_bar("CPU Avg", az["utilization"]["cpu_avg"], "#0078D4") +
        _r_bar("Memory",  az["utilization"]["memory"],  "#0078D4") +
        _r_bar("Disk",    az["utilization"]["disk"],    "#0078D4") +
        _r_bar("Network", az["utilization"]["network"], "#0078D4")
    )

    # ── Alerts ──
    ALERT_C = {"danger": "#c53030", "warning": "#c05621", "info": "#2b6cb0"}
    ALERT_I = {"danger": "&#9679;", "warning": "&#9650;", "info": "&#8505;"}
    alert_rows = ""
    for a in alerts:
        if a.get("resolved"):
            continue
        c  = ALERT_C.get(a["type"], "#718096")
        ic = ALERT_I.get(a["type"], "&#8226;")
        pb = a.get("provider", "").upper()
        alert_rows += (
            f'<tr><td style="padding:10px 0;border-bottom:1px solid #f7fafc;">'
            f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
            f'<td style="width:14px;vertical-align:top;padding-top:1px;font-size:9px;color:{c};">{ic}</td>'
            f'<td style="padding-left:6px;">'
            f'<div style="font-size:12px;font-weight:600;color:#2d3748;">{a["title"]}'
            f'<span style="font-size:9px;font-weight:700;background:{c}1a;color:{c};'
            f'padding:1px 5px;border-radius:3px;margin-left:6px;">{pb}</span></div>'
            f'<div style="font-size:11px;color:#718096;margin-top:2px;line-height:1.5;">{a["detail"]}</div>'
            f'</td>'
            f'<td style="text-align:right;font-size:10px;color:#a0aec0;white-space:nowrap;'
            f'vertical-align:top;padding-left:12px;">{a["time"]}</td>'
            f'</tr></table></td></tr>'
        )
    if not alert_rows:
        alert_rows = (
            '<tr><td style="padding:14px 0;font-size:12px;color:#a0aec0;text-align:center;">'
            'No active alerts.</td></tr>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;">
<tr><td align="center" style="padding:28px 16px 40px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Branding -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:10px 10px 0 0;border:1px solid #e2e8f0;border-bottom:none;">
      <tr><td style="text-align:center;padding:30px 24px 26px;">
        <svg width="56" height="38" viewBox="0 0 56 38" xmlns="http://www.w3.org/2000/svg"
          style="display:block;margin:0 auto 10px;">
          <rect x="3" y="20" width="50" height="18" rx="9" fill="#4285F4"/>
          <circle cx="14" cy="21" r="10" fill="#4285F4"/>
          <circle cx="28" cy="13" r="12" fill="#4285F4"/>
          <circle cx="42" cy="20" r="10" fill="#4285F4"/>
          <circle cx="14" cy="21" r="6" fill="#e8f0fe"/>
          <circle cx="28" cy="13" r="7" fill="#e8f0fe"/>
          <circle cx="42" cy="20" r="6" fill="#e8f0fe"/>
          <circle cx="14" cy="21" r="3" fill="#4285F4"/>
          <circle cx="28" cy="13" r="4" fill="#4285F4"/>
          <circle cx="42" cy="20" r="3" fill="#4285F4"/>
        </svg>
        <div style="font-size:28px;font-weight:800;letter-spacing:-0.8px;line-height:1;margin-bottom:6px;">
          <span style="color:#1a202c;">Cloud</span><span style="color:#4285F4;">Nexus</span>
        </div>
        <div style="font-size:10px;font-weight:600;color:#a0aec0;letter-spacing:2.5px;text-transform:uppercase;">
          Cloud Cost Intelligence
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Report title bar -->
  <tr><td style="padding-bottom:16px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#1e293b;border-radius:0 0 0 0;border:1px solid #e2e8f0;border-top:none;border-bottom:none;">
      <tr>
        <td style="padding:14px 24px;">
          <div style="font-size:13px;font-weight:700;color:#f8fafc;letter-spacing:0.2px;">
            Cloud Infrastructure Cost Report</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">{date_str}</div>
        </td>
        <td style="text-align:right;padding:14px 24px;">
          <div style="display:inline-block;background:#334155;border-radius:4px;
            padding:3px 10px;font-size:10px;font-weight:700;color:#94a3b8;
            text-transform:uppercase;letter-spacing:1px;">Daily Summary</div>
        </td>
      </tr>
    </table>
    <div style="height:3px;background:linear-gradient(90deg,#4285F4 0%,#0078D4 50%,#FF9900 100%);
      border-radius:0 0 2px 2px;"></div>
  </td></tr>

  <!-- KPI Bar -->
  <tr><td style="padding-bottom:14px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
      <tr>
        {kpi("Total Spend MTD",    _r_usd(ov["total_mtd"]),    "#1a202c")}
        {kpi("Active Services",    str(ov["active_services"]), "#1a202c")}
        {kpi("30-Day Forecast",    _r_usd(ov["forecast_30d"]), "#2b6cb0")}
        {kpi("Savings Identified", _r_usd(ov["savings_found"]),"#276749", last=True)}
      </tr>
    </table>
  </td></tr>

  <!-- Today's charges -->
  <tr><td style="padding-bottom:14px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
      <tr><td style="padding:14px 22px 10px;border-bottom:1px solid #f7fafc;">
        <span style="font-size:10px;font-weight:700;letter-spacing:1px;
          text-transform:uppercase;color:#a0aec0;">
          Today&#8217;s Charges &mdash; {td.get('date', today_label)}</span>
      </td></tr>
      <tr><td style="padding:14px 22px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          {today_col("Amazon Web Services", _r_usd(td.get("aws",   0)), "#FF9900")}
          {today_col("Google Cloud",        _r_usd(td.get("gcp",   0)), "#4285F4")}
          {today_col("Microsoft Azure",     _r_usd(td.get("azure", 0)), "#0078D4")}
          <td style="text-align:center;padding:0 12px;">
            <div style="font-size:10px;color:#a0aec0;letter-spacing:0.5px;margin-bottom:4px;">Combined Total</div>
            <div style="font-size:17px;font-weight:700;color:#1a202c;">{_r_usd(td.get("total", 0))}</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Provider cards -->
  <table width="100%" cellpadding="0" cellspacing="0">
    {provider_card("Amazon Web Services", "aws",   "#FF9900", "#fff8f0", aws, aws_m, aws_u)}
    {provider_card("Google Cloud",        "gcp",   "#4285F4", "#f0f4ff", gcp, gcp_m, gcp_u)}
    {provider_card("Microsoft Azure",     "azure", "#0078D4", "#f0f7ff", az,  az_m,  az_u)}
  </table>

  <!-- Alerts -->
  <tr><td style="padding-bottom:16px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
      <tr><td style="padding:14px 22px 6px;border-bottom:1px solid #f7fafc;">
        <span style="font-size:10px;font-weight:700;letter-spacing:1px;
          text-transform:uppercase;color:#a0aec0;">Active Alerts</span>
      </td></tr>
      <tr><td style="padding:4px 22px 10px;">
        <table width="100%" cellpadding="0" cellspacing="0">{alert_rows}</table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="text-align:center;font-size:11px;color:#a0aec0;line-height:2;padding-top:4px;">
    Generated {today.strftime("%B %d, %Y")} at {today.strftime("%H:%M")} UTC
    &nbsp;&middot;&nbsp; All amounts in USD
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


class CredentialPayload(BaseModel):
    provider:    str
    auth_type:   str
    credentials: Dict[str, Any]


@app.post("/api/credentials/connect")
async def credentials_connect(payload: CredentialPayload):
    provider  = payload.provider.lower()
    auth_type = payload.auth_type
    creds     = payload.credentials
    try:
        if provider == "aws":
            result = connect_aws(auth_type, creds)
        elif provider == "gcp":
            result = connect_gcp(auth_type, creds)
        elif provider == "azure":
            result = connect_azure(auth_type, creds)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
        if result["success"]:
            _credentials[provider] = {"auth_type": auth_type, "creds": creds, "meta": result}
            _invalidate_real_cache()
        return result
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/credentials/disconnect")
async def credentials_disconnect(payload: dict):
    provider = payload.get("provider", "").lower()
    _credentials.pop(provider, None)
    _invalidate_real_cache()
    return {"success": True}


@app.get("/api/credentials/status")
def credentials_status():
    return {p: {"connected": p in _credentials,
                "auth_type": _credentials[p].get("auth_type") if p in _credentials else None}
            for p in ["aws", "gcp", "azure"]}


class ReportSchedulePayload(BaseModel):
    email: str
    time: str


class ReportSendPayload(BaseModel):
    email: str


_report_schedule: Dict[str, str] = {}


@app.post("/api/report/schedule")
def save_report_schedule(payload: ReportSchedulePayload):
    if "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    _report_schedule[payload.email.lower()] = payload.time
    return {"success": True, "scheduled": {"email": payload.email.lower(), "time": payload.time}}


@app.delete("/api/report/schedule/{email}")
def delete_report_schedule(email: str):
    _report_schedule.pop(email.lower(), None)
    return {"success": True}


@app.post("/api/report/send-now")
def send_report_now(payload: ReportSendPayload):
    if "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    data    = _get_data("real")
    today   = datetime.utcnow()
    ov      = data["overview"]
    pr      = data["providers"]
    subject = f"Cloud Infrastructure Cost Report — {today.strftime('%B')} {today.day}, {today.year}"

    text_body = (
        f"Cloud Infrastructure Cost Report\n"
        f"{today.strftime('%A, %B')} {today.day}, {today.year}\n\n"
        f"SUMMARY\n"
        f"  Total Spend MTD:     {_r_usd(ov['total_mtd'])}\n"
        f"  Active Services:     {ov['active_services']}\n"
        f"  30-Day Forecast:     {_r_usd(ov['forecast_30d'])}\n"
        f"  Savings Identified:  {_r_usd(ov['savings_found'])}\n\n"
        f"PROVIDER BREAKDOWN\n"
        f"  Amazon Web Services: {_r_usd(pr['aws']['mtd'])}  ({pr['aws']['delta_pct']:+.1f}%)\n"
        f"  Google Cloud:        {_r_usd(pr['gcp']['mtd'])}  ({pr['gcp']['delta_pct']:+.1f}%)\n"
        f"  Microsoft Azure:     {_r_usd(pr['azure']['mtd'])}  ({pr['azure']['delta_pct']:+.1f}%)\n\n"
        f"Open the HTML version of this email for the full breakdown with services, "
        f"utilization, and active alerts."
    )

    html_body = _build_report_html(data)
    _send_email(payload.email.lower(), subject, text_body, html_body)
    return {"success": True, "sent_to": payload.email.lower()}


def _get_data(mode: str) -> dict:
    if mode == "mock":
        try:
            return get_mock_data()
        except ModuleNotFoundError:
            from .mock_data import get_mock_data as gm
            return gm()
    return _get_cached_real_data()



@app.get("/api/overview")
def overview(mode: str = "mock"):
    return _get_data(mode)["overview"]


@app.get("/api/provider/{provider}")
def provider_data(provider: str, mode: str = "mock"):
    data = _get_data(mode)
    pdata = data["providers"].get(provider)
    if not pdata:
        raise HTTPException(status_code=404, detail=f"Provider {provider} not found")
    return pdata


@app.get("/api/trend")
def trend(mode: str = "mock", days: int = 90):
    return _get_data(mode)["trend"][-days:]


@app.get("/api/analysis")
def analysis(mode: str = "real"):
    # mode supports "mock" but existing UI sends "real" only.
    try:
        if mode == "mock":
            try:
                from mock_data import get_mock_data  # noqa: F401
            except ModuleNotFoundError:
                from .mock_data import get_mock_data  # noqa: F401
            payload = analyze_cross_cloud({})

            payload["source"] = "mock"
            return payload
        payload = analyze_cross_cloud(_credentials)
        # If no live credentials, function already uses mock_data.
        return payload
    except Exception as e:
        # Never break UI
        payload = analyze_cross_cloud({})
        payload["source"] = "mock"
        payload["error"] = str(e)
        return payload


@app.get("/api/forecast")

def forecast(mode: str = "mock"):
    """
    Run ensemble forecast (Holt-Winters + LSTM + XGBoost + Claude AI) over
    the actual trend history — mock or live.  No hardcoded forecast values.
    """
    data    = _get_data(mode)
    history = [d["total"] for d in data["trend"]]
    if not history:
        raise HTTPException(status_code=422, detail="No trend data available for forecasting")
    result = run_forecast(history)
    # Attach per-provider shares for frontend to use
    trend_data = data["trend"]
    if trend_data:
        recent = trend_data[-30:]
        totals = {"aws": 0, "gcp": 0, "azure": 0, "total": 0}
        for d in recent:
            for k in totals:
                totals[k] += d.get(k, 0)
        grand = totals["total"] or 1
        result["provider_shares"] = {
            "aws":   round(totals["aws"]   / grand, 4),
            "gcp":   round(totals["gcp"]   / grand, 4),
            "azure": round(totals["azure"] / grand, 4),
        }
        # Per-provider history arrays for the chart (last 30 days)
        result["provider_history"] = {
            "aws":   [d.get("aws", 0)   for d in recent],
            "gcp":   [d.get("gcp", 0)   for d in recent],
            "azure": [d.get("azure", 0) for d in recent],
        }
    return result


@app.get("/api/alerts")
def alerts(mode: str = "mock"):
    return _get_data(mode)["alerts"]


@app.get("/api/export/csv")
def export_csv(mode: str = "mock"):
    data   = _get_data(mode)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Provider", "Service", "Cost", "Percentage", "Status"])
    for prov, pdata in data["providers"].items():
        for svc in pdata.get("services", []):
            writer.writerow([prov.upper(), svc["name"], svc["cost"], f"{svc['pct']}%", svc["status"]])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cloudnexus-export.csv"})


@app.get("/api/export/json")
def export_json(mode: str = "mock"):
    data    = _get_data(mode)
    content = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=cloudnexus-export.json"})


# ── INVOICES ──────────────────────────────────────────────────────────

@app.get("/api/invoices/{provider}")
def get_invoices(provider: str, mode: str = "mock"):
    from real_data import get_real_invoices
    provider = provider.lower()
    if provider not in ["aws", "gcp", "azure"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    if mode == "real" and _credentials:
        live = get_real_invoices(provider, _credentials)
        if live:
            return {"source": "live", "invoices": live}

    # Fallback: derive mock invoices from live trend data (no hardcoded amounts)
    data  = _get_data(mode)
    pdata = data["providers"].get(provider, {})
    mtd   = pdata.get("mtd", 0)
    svcs  = pdata.get("services", [])
    today = datetime.utcnow()

    # Build 6-month history from trend data
    trend = data.get("trend", [])

    def make_invoice(months_ago, status):
        month_start = (today.replace(day=1) - timedelta(days=months_ago * 28)).replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year+1, month=1, day=1)
        else:
            month_end = month_start.replace(month=month_start.month+1, day=1)

        # Compute amount from trend data for that month, falling back to mtd with decay
        month_label = month_start.strftime("%b")
        month_trend = [d for d in trend if d.get("date", "").startswith(month_label)]
        if month_trend:
            # Sum provider's daily costs for that month from trend
            share_key = provider
            amount = round(sum(d.get(share_key, 0) for d in month_trend), 2)
        else:
            amount = round(mtd * (0.95 ** months_ago), 2)

        if amount == 0:
            amount = round(mtd * (0.95 ** months_ago), 2)

        due_offsets = {"aws": 15, "gcp": 20, "azure": 25}
        items = [{"service": s["name"], "qty": "1 month",
                  "unit": round(s["cost"] * (0.95 ** months_ago), 2),
                  "total": round(s["cost"] * (0.95 ** months_ago), 2)} for s in svcs]
        return {
            "id":     f"INV-{provider.upper()}-{month_start.strftime('%Y-%m')}",
            "period": month_start.strftime("%b %Y"),
            "issued": month_end.strftime("%Y-%m-%d"),
            "due":    month_end.replace(day=min(due_offsets.get(provider, 15), 28)).strftime("%Y-%m-%d"),
            "amount": amount,
            "status": status,
            "items":  items,
            "source": "mock",
        }

    statuses = ["pending", "paid", "paid", "paid", "paid", "paid"]
    invoices = [make_invoice(i, statuses[i]) for i in range(6)]
    return {"source": "mock", "invoices": invoices}


# ── MONTHLY TREND ──────────────────────────────────────────────────────

@app.get("/api/trend/monthly")
def monthly_trend(mode: str = "mock"):
    if mode == "real" and _credentials:
        data = _get_data(mode)
        trend = data.get("trend", [])
        months: dict = {}
        for d in trend:
            try:
                month_label = d["date"][:3]
            except Exception:
                month_label = "Unknown"
            if month_label not in months:
                months[month_label] = {"month": month_label, "aws": 0, "gcp": 0, "azure": 0, "total": 0}
            months[month_label]["aws"]   += d.get("aws",   0)
            months[month_label]["gcp"]   += d.get("gcp",   0)
            months[month_label]["azure"] += d.get("azure", 0)
            months[month_label]["total"] += d.get("total", 0)
        return {"source": "live", "months": list(months.values())}

    # Derive from actual trend data — group by month
    data  = _get_data(mode)
    trend = data["trend"]
    months: dict = {}
    for d in trend:
        try:
            m = d["date"][:3]
        except Exception:
            m = "Unknown"
        if m not in months:
            months[m] = {"month": m, "aws": 0, "gcp": 0, "azure": 0, "total": 0}
        months[m]["aws"]   += d.get("aws",   0)
        months[m]["gcp"]   += d.get("gcp",   0)
        months[m]["azure"] += d.get("azure", 0)
        months[m]["total"] += d.get("total", 0)

    return {"source": mode, "months": list(months.values())}


# ── COST COMPARISON (Multi-Cloud FinOps) ──────────────────────────────

@app.get("/api/cost-comparison")
def cost_comparison(mode: str = "mock"):
    """
    Multi-cloud cost comparison payload: provider stats, radar, monthly history,
    budget analysis, savings recommendations, and cross-service table.
    Mirrors the Cost Analyst v2 comparison feature.
    """
    try:
        from cost_comparison import build_comparison_payload
    except ModuleNotFoundError:
        from .cost_comparison import build_comparison_payload

    data = _get_data(mode)
    providers_raw = data.get("providers", {})

    # Normalise provider info for the comparison builder
    providers_info = {}
    for p in ("aws", "gcp", "azure"):
        block = providers_raw.get(p, {})
        providers_info[p] = {
            "mtd":        block.get("mtd", 0),
            "delta_pct":  block.get("delta_pct", 0),
            "share":      data.get("overview", {}).get("providers", {}).get(p, {}).get("share", 0),
            "services":   block.get("services", []),
            "connected":  (p in _credentials),
            "real_data":  (p in _credentials),
        }

    # Pull live budgets from credentials meta if available
    budgets = None
    for p in ("aws", "gcp", "azure"):
        if p in _credentials and isinstance(_credentials[p].get("meta"), dict):
            # budget info not stored yet; leave as None for defaults
            pass

    # Compute monthly rollup from actual trend data (real when providers are connected)
    real_monthly = None
    trend = data.get("trend", [])
    if trend:
        monthly_map: dict = {}
        for d in trend:
            try:
                # trend dates are "Jan 01" format — group by month abbreviation
                month_key = d["date"][:3]
                if month_key not in monthly_map:
                    monthly_map[month_key] = {"label": month_key, "aws": 0, "gcp": 0, "azure": 0, "total": 0}
                for k in ("aws", "gcp", "azure", "total"):
                    monthly_map[month_key][k] += d.get(k, 0)
            except Exception:
                pass
        if monthly_map:
            real_monthly = list(monthly_map.values())

    return build_comparison_payload(providers_info, budgets=budgets, real_monthly=real_monthly)


# ── NAMED RESOURCES — real user-defined names + specs ─────────────────

@app.get("/api/resources/named")
def named_resources(mode: str = "real"):
    """
    Return all resources with user-defined names and full specs
    from every connected cloud provider.
    """
    try:
        from real_data import get_named_resources
    except ModuleNotFoundError:
        from .real_data import get_named_resources

    if mode == "real" and _credentials:
        resources = get_named_resources(_credentials)
        if resources:
            return {"source": "live", "resources": resources}

    # Fallback: build resource list from mock services data
    data = _get_data("mock")
    fallback = []
    for p, pdata in data.get("providers", {}).items():
        for svc in pdata.get("services", []):
            fallback.append({
                "provider": p.upper(),
                "type": svc.get("name", "Service"),
                "user_name": svc.get("name", "—"),
                "resource_id": "—",
                "region": "us-east-1",
                "state": svc.get("status", "healthy"),
                "specs": {
                    "Monthly Cost": f"${svc.get('cost', 0):,.2f}",
                    "% of Provider": f"{svc.get('pct', 0)}%",
                },
                "tags": {},
            })
    return {"source": "mock", "resources": fallback}
