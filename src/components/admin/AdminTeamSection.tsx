import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Eye,
  RefreshCw,
  Search,
  Settings,
  Users,
  FileText,
  Lock,
  Plus,
  Trash2,
  Edit2,
  UserCheck,
  GraduationCap,
  Award,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Mail,
  MessageSquare,
  Send,
  DollarSign,
  CreditCard,
  Database,
  ShieldCheck,
  RotateCcw,
  Activity,
  Check,
  X,
  Smartphone,
  Globe,
  Zap,
  TrendingUp,
  BarChart3,
  Receipt,
  Crown,
  ShieldAlert,
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronUp,
  Layers,
  Package,
  Copy,
  Calendar,
  MapPin,
  Palette,
  Star,
  IndianRupee,
  ImagePlus,
  Loader2,
  Link2
} from 'lucide-react';
import { api } from '../../services/api';
import { describeFamilyRenderQuality } from '../../services/formatUtils';
import logoImg from '../../assets/astrosivam_appicon.png';
import { Order, OrderItem, AppSettings, AdminStats, TeamMember, ContactMessage, BannedIpEntry, AiChatHandoff, ServiceType } from '../../types';
import { OrderReportModal } from '../common/OrderReportModal';
import { LivePdfPreviewModal } from '../common/LivePdfPreviewModal';
import { TeamMemberAvatar, isUsableTeamPhoto } from '../common/TeamMemberAvatar';
import { TEAM_PHOTO_ACCEPT, TEAM_PHOTO_MAX_BYTES, formatTeamPhotoBytes } from '../../services/teamPhoto';
import { canSelectUnitForBatch, explainOrderApprovalBlockReason, getBatchKeyForUnit, isUnitActionableForBatch } from '../../services/adminBatchApproval';
import { orderChartServiceType } from '../../services/multiPersonOrder';
import { DEFAULT_CURRENCY, DEFAULT_SERVICE_PRICES, MAX_USD_TO_INR_RATE, MIN_USD_TO_INR_RATE, USD_TO_INR_RATE, normalizeUsdToInrRate, usdToInr } from '../../services/pricing';
import { ADMIN_PRICED_SERVICES, serviceDisplayName, getItemStatusBadge } from './adminPortalHelpers';

export const AdminTeamSection: React.FC<{ ctx: any }> = ({ ctx }) => {
  const {
    teamMembers,
    activeSection,
    isTeamModalOpen,
    setIsTeamModalOpen,
    editingMember,
    memberFormData,
    setMemberFormData,
    isTeamPhotoUploading,
    isSavingTeamMember,
    teamSaveError,
    teamPhotoError,
    teamPhotoInfo,
    setTeamPhotoInfo,
    showPhotoUrlField,
    setShowPhotoUrlField,
    teamPhotoInputRef,
    handleOpenAddTeamModal,
    handleOpenEditTeamModal,
    handleTeamPhotoSelected,
    handleRemoveTeamPhoto,
    handleSaveTeamMember,
    handleToggleMemberActive,
    handleDeleteTeamMember,
  } = ctx;

  return (
    <>
            {activeSection === 'team' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                India-Based Astrology & Sivachariyar Team Members
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add, edit, or manage 10 or more/less team scholars. Active members are displayed on the public ASTRO SIVAM website.
              </p>
            </div>

            <button
              onClick={handleOpenAddTeamModal}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Team Member</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Member & Photo</th>
                    <th className="px-4 py-3">Designation / Title</th>
                    <th className="px-4 py-3">Education & Credentials</th>
                    <th className="px-4 py-3">Experience</th>
                    <th className="px-4 py-3">Specializations</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {teamMembers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No team members configured yet. Click &ldquo;Add New Team Member&rdquo; above.
                      </td>
                    </tr>
                  ) : (
                    teamMembers.map(member => {
                      const name = member.nameEn || member.fullName || 'Team Member';
                      const title = member.titleEn || member.vedicEducation || 'Astrologer';
                      const edu = member.educationEn || member.education || member.vedicEducation || '-';
                      const exp = member.experienceYears ?? member.yearsOfExperience ?? 15;
                      const specs = Array.isArray(member.specializations)
                        ? member.specializations
                        : typeof member.specialization === 'string'
                        ? member.specialization.split(',').map(s => s.trim()).filter(Boolean)
                        : [];

                      return (
                        <tr key={member.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border border-amber-500/30 shrink-0 flex items-center justify-center">
                                <TeamMemberAvatar
                                  photoUrl={member.photoUrl}
                                  name={name}
                                  className="w-full h-full"
                                  imageClassName="w-full h-full object-cover"
                                  emblemClassName="w-full h-full object-contain p-1"
                                />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 dark:text-white">{name}</div>
                                {member.nameTa && <div className="text-[10px] text-amber-600 dark:text-amber-400">{member.nameTa}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{title}</div>
                            {member.titleTa && <div className="text-[10px] text-slate-400">{member.titleTa}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700 dark:text-slate-300">{edu}</div>
                            {member.educationTa && <div className="text-[10px] text-slate-400">{member.educationTa}</div>}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {exp} Years
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <div className="flex flex-wrap gap-1">
                              {specs.map((spec, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                >
                                  {spec}
                                </span>
                              ))}
                            </div>
                          </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleMemberActive(member)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                              member.isActive
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>{member.isActive ? 'Active' : 'Hidden'}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditTeamModal(member)}
                              title="Edit Member"
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeamMember(member.id, member.fullName || member.nameEn || '')}
                              title="Delete Member"
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Team Member Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingMember ? 'Edit Astrology Team Member' : 'Add Astrology Team Member'}
                </h3>
              </div>
              <button
                onClick={() => setIsTeamModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeamMember} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={memberFormData.nameEn}
                    onChange={e => setMemberFormData({ ...memberFormData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    placeholder="e.g. Astrologer S. Sivaprakash"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Name (Tamil)
                  </label>
                  <input
                    type="text"
                    value={memberFormData.nameTa}
                    onChange={e => setMemberFormData({ ...memberFormData, nameTa: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    placeholder="சிவாச்சாரியார் ஆர். வெங்கடேச குருக்கள்"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Name (Hindi)
                  </label>
                  <input
                    type="text"
                    value={memberFormData.nameHi}
                    onChange={e => setMemberFormData({ ...memberFormData, nameHi: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    placeholder="शिवाचार्य आर. वेंकटेश गुरुकल"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Title / Designation (English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={memberFormData.titleEn}
                    onChange={e => setMemberFormData({ ...memberFormData, titleEn: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Title / Designation (Tamil)
                  </label>
                  <input
                    type="text"
                    value={memberFormData.titleTa}
                    onChange={e => setMemberFormData({ ...memberFormData, titleTa: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Photo *
                  </label>
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <TeamMemberAvatar
                        photoUrl={memberFormData.photoUrl}
                        name={memberFormData.nameEn || 'Team member'}
                        className="w-full h-full"
                        imageClassName="w-full h-full object-cover"
                        emblemClassName="w-full h-full object-contain p-2"
                      />
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <input
                        ref={teamPhotoInputRef}
                        data-testid="team-photo-input"
                        type="file"
                        accept={TEAM_PHOTO_ACCEPT}
                        className="hidden"
                        onChange={e => handleTeamPhotoSelected(e.target.files?.[0] ?? null)}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="team-photo-upload-button"
                          disabled={isTeamPhotoUploading}
                          onClick={() => teamPhotoInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-[11px] font-bold cursor-pointer transition-colors"
                        >
                          {isTeamPhotoUploading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isTeamPhotoUploading
                              ? 'Uploading…'
                              : memberFormData.photoUrl
                              ? 'Replace photo'
                              : 'Upload photo'}
                          </span>
                        </button>
                        {memberFormData.photoUrl && !isTeamPhotoUploading && (
                          <button
                            type="button"
                            onClick={handleRemoveTeamPhoto}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowPhotoUrlField(v => !v)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 underline cursor-pointer"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>{showPhotoUrlField ? 'hide link field' : 'or paste a link'}</span>
                        </button>
                      </div>

                      <p data-testid="team-photo-hint" className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        JPG, PNG or WebP. It is cropped to a square from the middle and shrunk to{' '}
                        {formatTeamPhotoBytes(TEAM_PHOTO_MAX_BYTES)} automatically — no editing needed, and it works
                        straight from your phone.
                      </p>
                      {teamPhotoInfo && !isTeamPhotoUploading && (
                        <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          ✓ Uploaded {formatTeamPhotoBytes(teamPhotoInfo.bytes)} • {teamPhotoInfo.width}×
                          {teamPhotoInfo.height}px
                        </p>
                      )}
                      {teamPhotoError && (
                        <p data-testid="team-photo-error" className="text-[10px] font-semibold text-rose-600 leading-relaxed">
                          {teamPhotoError}
                        </p>
                      )}
                    </div>
                  </div>

                  {showPhotoUrlField && (
                    <input
                      type="text"
                      inputMode="url"
                      value={memberFormData.photoUrl}
                      onChange={e => {
                        setMemberFormData({ ...memberFormData, photoUrl: e.target.value });
                        setTeamPhotoInfo(null);
                      }}
                      placeholder="https://… (only if the photo is already online)"
                      className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                    />
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Experience (Years) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={memberFormData.experienceYears}
                    onChange={e => setMemberFormData({ ...memberFormData, experienceYears: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Education & Credentials (English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={memberFormData.educationEn}
                    onChange={e => setMemberFormData({ ...memberFormData, educationEn: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Education & Credentials (Tamil)
                  </label>
                  <input
                    type="text"
                    value={memberFormData.educationTa}
                    onChange={e => setMemberFormData({ ...memberFormData, educationTa: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Specializations (Comma separated) *
                </label>
                <input
                  type="text"
                  required
                  value={memberFormData.specializations}
                  onChange={e => setMemberFormData({ ...memberFormData, specializations: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  placeholder="Birth Jathagam, 10 Poruthams, Baby Naming, Subha Muhurtham, Sade Sati Remedies"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Bio Summary (English)
                  </label>
                  <textarea
                    rows={2}
                    value={memberFormData.bioEn}
                    onChange={e => setMemberFormData({ ...memberFormData, bioEn: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Bio Summary (Tamil)
                  </label>
                  <textarea
                    rows={2}
                    value={memberFormData.bioTa}
                    onChange={e => setMemberFormData({ ...memberFormData, bioTa: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              {teamSaveError && (
                <div
                  data-testid="team-member-save-error"
                  className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300 leading-relaxed"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{teamSaveError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberFormData.isActive}
                      onChange={e => setMemberFormData({ ...memberFormData, isActive: e.target.checked })}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                    />
                    <span>Active & Visible on Website</span>
                  </label>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Order:</span>
                    <input
                      type="number"
                      value={memberFormData.order}
                      onChange={e => setMemberFormData({ ...memberFormData, order: Number(e.target.value) })}
                      className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTeamModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="team-member-save"
                    disabled={isSavingTeamMember}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-1.5"
                  >
                    {isSavingTeamMember && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isSavingTeamMember
                      ? 'Saving…'
                      : editingMember
                      ? 'Update Member'
                      : 'Add Member'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
};
