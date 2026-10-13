import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Database,
  HardDrive, RefreshCw, Server, ShieldCheck, XCircle
} from 'lucide-react';
import { api } from '../../services/api';

/**
 * Admin → System Health.
 *
 * Renders GET /api/admin/health.php: database reachability, schema drift,
 * payment provider / webhook-secret configuration, capture + webhook-ledger
 * counters, storage, the last backup marker, log routing, PHP limits and disk.
 *
 * WHY: the endpoint exists so an operator does not have to SSH in to answer
 * "is the site healthy?", and this panel is what makes that true for the admin
 * who never opens a terminal. Secrets are never part of the payload — the
 * endpoint reports booleans only.
 */

interface HealthCheck {
  name: string;
  status: 'ok' | 'degraded' | 'failing';
  detail: string;
  data?: any;
}

interface HealthReport {
  success: boolean;
  service?: string;
  status?: 'ok' | 'degraded' | 'failing';
  generatedAt?: string;
  durationMs?: number;
  summary?: { ok: number; degraded: number; failing: number };
  checks?: HealthCheck[];
  message?: string;
}

const statusStyles: Record<string, { badge: string; icon: React.ReactNode; label: string }> = {
  ok: {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />,
    label: 'OK'
  },
  degraded: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'DEGRADED'
  },
  failing: {
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    icon: <XCircle className="w-4 h-4" />,
    label: 'FAILING'
  }
};

const checkIcons: Record<string, React.ReactNode> = {
  database: <Database className="w-4 h-4" />,
  schema: <Server className="w-4 h-4" />,
  'payments.providers': <ShieldCheck className="w-4 h-4" />,
  'payments.capture': <Activity className="w-4 h-4" />,
  'payments.webhooks': <Activity className="w-4 h-4" />,
  storage: <HardDrive className="w-4 h-4" />,
  backups: <HardDrive className="w-4 h-4" />,
  logging: <Server className="w-4 h-4" />,
  runtime: <Server className="w-4 h-4" />,
  disk: <HardDrive className="w-4 h-4" />
};

export const SystemHealthPanel: React.FC = () => {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [checkedAt, setCheckedAt] = useState<string>('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await api.getSystemHealth();
      if (!res || res.success !== true || !Array.isArray(res.checks)) {
        setError(res?.message || 'The health endpoint did not return a report.');
        setReport(null);
      } else {
        setReport(res);
      }
      setCheckedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message || 'Could not reach the health endpoint.');
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // A health panel that is stale is misleading: refresh every 2 minutes while
    // it is open, and always allow a manual re-check.
    const timer = setInterval(load, 120000);
    return () => clearInterval(timer);
  }, []);

  const overall = report?.status || 'degraded';
  const overallStyle = statusStyles[overall] || statusStyles.degraded;
  const failing = (report?.checks || []).filter(check => check.status === 'failing');
  const degraded = (report?.checks || []).filter(check => check.status === 'degraded');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-500" />
            System Health
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Live report from <code className="text-[11px]">{'/api/admin/health.php'}</code>: database, schema,
            payment providers and webhook verification, capture status, the idempotency ledger, storage,
            the last backup, log routing, PHP limits and disk. The site answers <code className="text-[11px]">503</code> when a
            check fails, so an uptime monitor can watch this endpoint directly.
          </p>
        </div>
        <button
          onClick={load}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Checking…' : 'Re-check now'}
        </button>
      </div>

      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${overallStyle.badge}`}>
        {overallStyle.icon}
        <div className="flex-1">
          <div className="text-sm font-bold">
            {overall === 'ok' ? 'All systems healthy' : overall === 'degraded' ? 'Degraded — attention recommended' : 'Failing — action required'}
          </div>
          <div className="text-[11px] opacity-90">
            {report?.summary
              ? `${report.summary.ok} ok · ${report.summary.degraded} degraded · ${report.summary.failing} failing`
              : 'No report yet'}
            {checkedAt ? ` · checked ${checkedAt}` : ''}
            {report?.durationMs !== undefined ? ` · ${report.durationMs} ms` : ''}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs p-3 flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {(failing.length > 0 || degraded.length > 0) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {[...failing, ...degraded].map(check => (
            <div key={`attn-${check.name}`} className="p-3 text-xs flex items-start gap-2">
              <span className={check.status === 'failing' ? 'text-rose-400' : 'text-amber-400'}>
                {check.status === 'failing' ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </span>
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200">{check.name}</div>
                <div className="text-slate-500 dark:text-slate-400">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {(report?.checks || []).map(check => {
          const style = statusStyles[check.status] || statusStyles.degraded;
          const isOpen = !!expanded[check.name];
          const hasData = check.data && typeof check.data === 'object' && Object.keys(check.data).length > 0;
          return (
            <div key={check.name} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
              <button
                onClick={() => hasData && setExpanded(prev => ({ ...prev, [check.name]: !prev[check.name] }))}
                className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="text-slate-400 dark:text-slate-500">
                  {checkIcons[check.name] || <Server className="w-4 h-4" />}
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 w-40 shrink-0">{check.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.badge}`}>{style.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-1 truncate">{check.detail}</span>
                {hasData && (isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />)}
              </button>
              {isOpen && hasData && (
                <pre className="mx-3 mb-3 p-3 rounded-lg bg-slate-950 text-slate-300 text-[10px] leading-relaxed overflow-x-auto">
                  {JSON.stringify(check.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Failing checks are appended to the PHP error log as structured{' '}
        <code className="text-[11px]">admin_health_*</code> lines. Backup and restore drills, error-log routing and the
        external uptime monitor are documented in <code className="text-[11px]">docs/HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md</code>.
      </p>
    </div>
  );
};
