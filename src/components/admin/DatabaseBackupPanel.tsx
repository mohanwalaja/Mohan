import React, { useState } from 'react';
import { CheckCircle2, Database, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';

export const DatabaseBackupPanel: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; text: string } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMessage(null);
    try {
      const response = await api.exportDatabase();
      if (!response.success || !response.data) {
        throw new Error(response.message || 'The export could not be created.');
      }

      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AstroSivam_Admin_Data_Export_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage({
        success: true,
        text: 'The allowlisted data export was downloaded. Store it only in encrypted, access-controlled storage.'
      });
    } catch (error: any) {
      setStatusMessage({ success: false, text: error?.message || 'Export failed.' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 select-none">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
          <Database className="h-3.5 w-3.5" />
          <span>Read-only database export</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Export operations data</h2>
        <p className="mt-1 text-sm text-slate-500">
          Download an admin-only JSON export of users, birth profiles, orders, contact messages and audit logs.
        </p>
      </div>

      {statusMessage && (
        <div className={`flex items-center gap-2.5 rounded-2xl border p-4 text-xs ${statusMessage.success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'}`}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage.text}</span>
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create JSON export</h3>
            <p className="mt-1 text-xs text-slate-500">The server disables caching and records this export in the admin audit log.</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
          >
            {isExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>{isExporting ? 'Preparing export…' : 'Download JSON'}</span>
          </button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">Contains customer personal data</p>
              <p className="mt-1">The export excludes password hashes, OTP/reset secrets, provider credentials, payment signatures, session data and rate-limit keys. It is not a complete disaster-recovery backup.</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Database import/restore is intentionally unavailable. Arbitrary JSON imports could overwrite or corrupt production records; use the verified server-side backup and restore procedure instead.
        </p>
      </section>
    </div>
  );
};
