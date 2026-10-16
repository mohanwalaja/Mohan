import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

type Design = 'original' | 'ivory';

/** Admin-only control; no changes to the admin's own visual design. */
export function UserDesignSettings() {
  const { settings, refreshSettings } = useAuth();
  const [design, setDesign] = useState<Design>('original');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setDesign(settings?.userDesign === 'ivory' ? 'ivory' : 'original');
  }, [settings?.userDesign]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const result = await api.updateAdminSettings({ userDesign: design });
      if (!result.success) throw new Error(result.message || 'Unable to save design.');
      await refreshSettings();
      setMessage('User website design saved successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save design. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-700 p-4">
      <label htmlFor="user-website-design" className="block text-sm font-bold text-white">User website design</label>
      <p className="text-xs text-slate-400">Choose the design for all user pages and customer login. Admin login and admin panel always keep their original dark design.</p>
      <select id="user-website-design" value={design} disabled={saving} onChange={e => { setDesign(e.target.value as Design); setMessage(''); }} className="w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-sm text-white">
        <option value="original">Original · Dark design</option>
        <option value="ivory">01 · Ivory &amp; Saffron</option>
      </select>
      <button type="button" disabled={saving} onClick={save} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : 'Save website design'}</button>
      {message && <p role="status" className="text-xs text-slate-200">{message}</p>}
    </section>
  );
}
