import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  User,
  MapPin,
  Calendar,
  Clock,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Compass,
  Heart,
  Baby,
  Edit2,
  Save,
  Mail,
  Send,
  X,
  ShieldCheck,
  Check,
  RotateCcw,
  Download,
  Users,
  Plus,
  Trash2,
  MessageCircle,
  Phone,
  ChevronDown,
  Loader2,
  CalendarDays,
  Wallet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';
import { normalizeReportLanguage } from '../services/reportLanguage';
import { PDF_CAPTURE_ERROR } from '../services/pdfErrors';
import { loadPdfEngine } from '../services/pdfEngine';
import { Order, OrderItem, BirthProfile, CustomerReview, ReviewEligibleOrder, FamilyMember, FamilyRelation, MAX_FAMILY_MEMBERS, ChatDeliveryState, BirthdayWishState } from '../types';
import { GooglePlacesPicker, LocationData } from '../components/common/GooglePlacesPicker';
import { BirthDateField, BirthTimeField, BirthTimeZoneNotice } from '../components/common/BirthDateTimeFields';
import { PersonNameField } from '../components/common/PersonNameField';
import { resolveDisplayName } from '../utils/displayName';
import AiAstrologerPanel from '../components/ai-astrologer/AiAstrologerPanel';
import { SEO } from '../components/common/SEO';
import { RouteLink } from '../components/common/RouteLink';
import { OrderReviewStrip } from '../components/reviews/OrderReviewStrip';
import { ReviewFormModal } from '../components/reviews/ReviewFormModal';
import { defaultReviewDisplayName } from '../services/reviews';
import { captureReviewInvite, clearReviewInvite, resolveReviewInvite } from '../services/reviewInvite';
import { resolveLocationTimezone } from '../lib/timezone';
import {
  FAMILY_RELATION_OPTIONS,
  familyRelationLabel,
  isValidBirthTime,
  isValidIsoBirthDate,
  isVerifiedBirthLocation,
  locationFromBirthProfile,
  normalizeBirthDate,
  normalizeBirthTime,
  normalizePersonName,
  setPendingOrderFor
} from '../utils/birthDetails';

/**
 * Report download copy and limits (customer bug, 2026-10-21: "download the
 * report from user profile can't download" — iPhone/iPad Safari, spinner and
 * then nothing).
 *
 * The download itself is unchanged in substance: the frozen snapshot, the same
 * HTML builders and the same print-density capture that produced the emailed
 * PDF. What was missing was honesty on a device that could not finish — a
 * button that spun forever, a file the browser silently refused to take, and no
 * way for the customer to get the bytes they had paid for.
 */

/**
 * How long one download may run before the customer is told it stalled.
 *
 * Generous on purpose: a phone fetching the ~780 KB engine over mobile data and
 * then capturing a ten-page report at 211 dpi can legitimately take a couple of
 * minutes. The guard exists to end a SILENT wait, not to interrupt a slow one.
 */
const DOWNLOAD_STALL_GUARD_MS = 150_000;

const REPORT_READY_MESSAGE =
  'Report downloaded — the same print-quality PDF that was emailed to you. ' +
  'If the file did not open, tap "Save the PDF" below.';

const DOWNLOAD_STALLED_MESSAGE =
  'This download did not finish on this device, so the button was freed instead of spinning forever. ' +
  'Nothing was charged and the PDF in your email is still valid. Close other tabs and tap Download Report ' +
  'again, or open My Orders on a computer — a desktop browser always saves the same print-quality file.';

/**
 * Why a capture can fail on a phone and what to do about it. iOS gets its own
 * wording because the usual cause there is canvas memory: Safari gives a web
 * page far less than a desktop browser, and a print-density A4 raster is ~17 MB
 * before encoding.
 */
const deviceCaptureFailureMessage = (): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIos =
    /iP(hone|ad|od)/i.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points tell them apart.
    (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  return isIos
    ? 'Your iPhone or iPad could not render the report at print quality — Safari gives a page much less memory ' +
      'than a computer, and every A4 page is captured at 200 dpi. Nothing was saved and nothing was charged. ' +
      'Close other Safari tabs (or restart Safari) and tap Download Report again; opening My Orders on a ' +
      'computer always works, and the PDF in your email is the same file.'
    : 'This device could not render the report at print quality. Please retry on a desktop browser — your emailed copy remains valid.';
};

interface CustomerDashboardProps {
  onNavigate: (route: string) => void;
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ onNavigate }) => {
  const {
    user, isAdmin, birthProfile, updateBirthProfile, refreshProfile,
    familyMembers, saveFamilyMember, deleteFamilyMember, refreshFamilyMembers
  } = useAuth();
  const { language: appLanguage } = useLanguage();
  // The name saved in the website profile is authoritative — never a stale
  // name or one with a "(Google)" tag attached.
  const displayName = user ? resolveDisplayName(birthProfile?.name, user.name, user.email) : 'User';
  // The account holder counts as ONE of the MAX_FAMILY_MEMBERS saved people:
  // there is no separate saved birth profile any more.
  const savedPeopleCount = familyMembers.length + (birthProfile ? 1 : 0);
  // Legacy accounts may hold 6 family members + their own profile (the old
  // rule allowed 6 BESIDES the profile). Show the capped count, never "7/6".
  const savedPeopleDisplay = Math.min(savedPeopleCount, MAX_FAMILY_MEMBERS);
  const savedBirthLocation = locationFromBirthProfile(birthProfile);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'family'>('orders');
  // Account-alert settings live in the dashboard header now (the separate
  // "Saved Birth Profile" tab is gone — you are the first saved person).
  const [alertsOpen, setAlertsOpen] = useState(false);
  // Source-based astrologer entry point. `aiChatOrder` is null for a general chat, or the
  // order whose report the customer wants explained.
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatOrder, setAiChatOrder] = useState<Order | null>(null);

  // Edit Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [pName, setPName] = useState(
    normalizePersonName(birthProfile?.name || '') || normalizePersonName(user?.name || '')
  );
  const [pDob, setPDob] = useState(normalizeBirthDate(birthProfile?.dob || ''));
  const [pTob, setPTob] = useState(normalizeBirthTime(birthProfile?.tob || ''));
  const [pGender, setPGender] = useState<'M' | 'F'>(birthProfile?.gender || 'M');
  const [pLocation, setPLocation] = useState<LocationData | null>(() => savedBirthLocation);
  const profileTimezone = pLocation
    ? resolveLocationTimezone(
        pDob, pTob, pLocation.latitude, pLocation.longitude,
        pLocation.timezoneOffsetHours, pLocation.timeZoneId
      )
    : null;
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Family Members State (saved birth details for up to MAX_FAMILY_MEMBERS
  // people; order forms fill one in only when explicitly picked there).
  const [familyFormOpen, setFamilyFormOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fRelation, setFRelation] = useState<FamilyRelation>('OTHER');
  const [fDob, setFDob] = useState('');
  const [fTob, setFTob] = useState('');
  const [fGender, setFGender] = useState<'M' | 'F'>('M');
  const [fLocation, setFLocation] = useState<LocationData | null>(null);
  const familyTimezone = fLocation
    ? resolveLocationTimezone(
        fDob, fTob, fLocation.latitude, fLocation.longitude,
        fLocation.timezoneOffsetHours, fLocation.timeZoneId
      )
    : null;
  const [familySaveError, setFamilySaveError] = useState('');
  const [familySaveSuccess, setFamilySaveSuccess] = useState('');
  const [isSavingFamily, setIsSavingFamily] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  // Frozen report download state (keyed per order / per order item).
  const [downloadingKey, setDownloadingKey] = useState('');
  // Keep one expand state per order: the admin-style summary stays compact,
  // while birth details and payment information remain behind View details.
  // Opening one card must never open its neighbours.
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  // Second level of the family card: tapping a name opens that person's birth
  // details, without opening their siblings'.
  const [expandedPersons, setExpandedPersons] = useState<Record<string, boolean>>({});

  // Family bundles arrive as ONE orders row per chart sharing group_id
  // (api/services/index.php: "one orders row per chart, grouped by group_id"),
  // which used to mean one tall card per person. Group them so a family reads as
  // a single card: names behind the first tap, each person's birth details
  // behind a tap on their name.
  const orderGroups = useMemo(() => {
    const groups: Order[][] = [];
    const byKey = new Map<string, Order[]>();
    for (const entry of orders) {
      const key = entry.groupId || entry.id;
      const existing = byKey.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        const fresh: Order[] = [entry];
        byKey.set(key, fresh);
        groups.push(fresh);
      }
    }
    for (const list of groups) {
      list.sort(
        (a, b) =>
          (a.groupOrderIndex ?? 0) - (b.groupOrderIndex ?? 0) ||
          String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      );
    }
    return groups;
  }, [orders]);
  const [downloadFeedback, setDownloadFeedback] = useState<{ orderId: string; type: 'success' | 'error'; message: string } | null>(null);
  /**
   * The rendered report the customer can still take with a tap.
   *
   * WHY THIS EXISTS (customer bug, 2026-10-21 — "download the report from user
   * profile can't download", iPhone/iPad Safari): a print-density capture takes
   * tens of seconds, and by the time it finishes the tap that started it is no
   * longer a user gesture. Desktop browsers still honour the scripted
   * `anchor.click()`; iOS Safari silently drops it, so the customer saw the
   * spinner stop, no file, and no error. The blob URL is therefore kept and
   * offered as a REAL link: a fresh tap always downloads, on every device, and
   * it is the identical print-quality file.
   */
  const [savedReport, setSavedReport] = useState<{ orderId: string; url: string; fileName: string } | null>(null);
  // Set once the deferred PDF engine is loaded: releases our blob URLs. The
  // dashboard may never import the exporter statically (initial-js-budget).
  const releaseSavedPdfRef = useRef<(() => void) | null>(null);

  // WhatsApp & Viber alert state: one saved number, verified per app.
  const [chatDelivery, setChatDelivery] = useState<ChatDeliveryState | null>(null);
  const [chatPhoneInput, setChatPhoneInput] = useState('');
  const [chatOtpChannel, setChatOtpChannel] = useState<'whatsapp' | 'viber' | null>(null);
  const [chatOtpCode, setChatOtpCode] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFeedback, setChatFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  /**
   * The customer's OWN birthday-wish consent (migration 020). It lives in this
   * panel because it is delivered to the same verified number, and it is read
   * separately because the consent is separate: an order alert is announced at
   * checkout, a birthday wish is not, so nothing is sent until this is switched
   * on here.
   */
  const [birthdayWishes, setBirthdayWishes] = useState<BirthdayWishState | null>(null);

  const loadBirthdayWishes = async () => {
    try {
      const result = await api.getBirthdayWishes();
      if (result.success && result.birthdayWishes) setBirthdayWishes(result.birthdayWishes);
    } catch {
      /* the toggle simply stays hidden until the state is known */
    }
  };

  const loadChatDelivery = async () => {
    try {
      const result = await api.getChatDelivery();
      if (result.success && result.chatDelivery) {
        setChatDelivery(result.chatDelivery);
        setChatPhoneInput(result.chatDelivery.phone || user?.mobile || '');
      }
    } catch {
      /* panel simply stays in its default state */
    }
  };

  useEffect(() => {
    if (user) {
      loadChatDelivery();
      loadBirthdayWishes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSaveChatNumber = async () => {
    if (!chatPhoneInput.trim()) {
      setChatFeedback({ type: 'error', message: 'Please enter your mobile number with country code (for example +91 98765 43210).' });
      return;
    }
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const result = await api.saveChatDeliveryNumber(chatPhoneInput.trim());
      if (result.chatDelivery) setChatDelivery(result.chatDelivery);
      setChatFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Number saved.' : 'Could not save the number.')
      });
    } catch (err: any) {
      setChatFeedback({ type: 'error', message: err?.message || 'Could not save the number.' });
    } finally {
      setChatBusy(false);
    }
  };

  const handleRemoveChatNumber = async () => {
    if (!window.confirm('Remove your WhatsApp/Viber alert number? Order-status alerts will stop. Reports and invoices continue to arrive by email.')) return;
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const result = await api.removeChatDelivery();
      if (result.chatDelivery) {
        setChatDelivery(result.chatDelivery);
        setChatPhoneInput('');
      }
      setChatOtpChannel(null);
      setChatFeedback({ type: result.success ? 'success' : 'error', message: result.message || 'Number removed.' });
    } catch (err: any) {
      setChatFeedback({ type: 'error', message: err?.message || 'Could not remove the number.' });
    } finally {
      setChatBusy(false);
    }
  };

  const handleRequestChatOtp = async (channel: 'whatsapp' | 'viber') => {
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const result = await api.requestChatDeliveryOtp(channel);
      if (result.success) setChatOtpChannel(channel);
      setChatFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Code sent.' : 'Could not send the code.')
      });
    } catch (err: any) {
      setChatFeedback({ type: 'error', message: err?.message || 'Could not send the code.' });
    } finally {
      setChatBusy(false);
    }
  };

  const handleConfirmChatOtp = async () => {
    if (!chatOtpChannel) return;
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const result = await api.confirmChatDeliveryOtp(chatOtpChannel, chatOtpCode);
      if (result.chatDelivery) setChatDelivery(result.chatDelivery);
      if (result.success) {
        setChatOtpChannel(null);
        setChatOtpCode('');
        // Verifying a number is what makes a birthday wish deliverable, so the
        // consent panel re-reads its state (channels + saved people).
        loadBirthdayWishes();
      }
      setChatFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Verified.' : 'That code did not match.')
      });
    } catch (err: any) {
      setChatFeedback({ type: 'error', message: err?.message || 'That code did not match.' });
    } finally {
      setChatBusy(false);
    }
  };

  /**
   * Birthday wishes on/off. The language sent with the switch is the one the
   * site is in right now, so the wish arrives in the language the customer is
   * reading — and it is stored, because the cron runs long after this tab is
   * closed.
   */
  const handleToggleBirthdayWishes = async (next: boolean) => {
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const result = await api.saveBirthdayWishPreference(next, appLanguage);
      if (result.birthdayWishes) setBirthdayWishes(result.birthdayWishes);
      setChatFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Saved.' : 'Could not save that setting.')
      });
    } catch (err: any) {
      setChatFeedback({ type: 'error', message: err?.message || 'Could not save that setting.' });
    } finally {
      setChatBusy(false);
    }
  };

  const handleToggleEmailBirthdayWishes = async (next: boolean) => {
    setChatBusy(true);
    setChatFeedback(null);
    try {
      const result = await api.saveEmailBirthdayWishPreference(next, appLanguage);
      if (result.birthdayWishes) setBirthdayWishes(result.birthdayWishes);
      setChatFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Email birthday wishes updated.' : 'Could not save email wish setting.')
      });
    } catch (err: any) {
      setChatFeedback({ type: 'error', message: err?.message || 'Could not save email wish setting.' });
    } finally {
      setChatBusy(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadBirthdayWishes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birthProfile?.dob, familyMembers.length]);

  // Email Resend / Update Modal State
  const [resendOrder, setResendOrder] = useState<Order | null>(null);
  const [resendEmailInput, setResendEmailInput] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Verified reviews (SEO audit 2026-10-15): the server says which paid,
  // delivered orders can be reviewed; the strip + form only appear for those.
  const [myReviews, setMyReviews] = useState<CustomerReview[]>([]);
  const [reviewableOrders, setReviewableOrders] = useState<ReviewEligibleOrder[]>([]);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  // "Rate your report" link from a delivery email (/dashboard?review=<order
  // number>), remembered across the sign-in detour — services/reviewInvite.ts.
  const [reviewInvite, setReviewInvite] = useState<string | null>(null);

  const fetchMyReviews = async () => {
    try {
      const res = await api.getMyReviews();
      if (res.success) {
        setMyReviews(res.reviews);
        setReviewableOrders(res.eligibleOrders);
        setReviewsLoaded(true);
      }
    } catch (err) {
      // Reviews are optional on this screen; the orders still render.
      console.error('Failed to fetch reviews:', err);
    }
  };

  const handleReviewSaved = (review: CustomerReview, message: string) => {
    setMyReviews(prev => [review, ...prev.filter(existing => existing.id !== review.id)]);
    setReviewOrderId(null);
    setReviewNotice({ tone: 'success', text: message });
  };

  const fetchOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await api.getMyOrders();
      if (res.success && res.orders) {
        setOrders(res.orders);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    if (user) {
      refreshProfile();
      refreshFamilyMembers();
    }
    setReviewInvite(captureReviewInvite());
  }, []);

  // Reviews belong to the signed-in customer. A fresh page load — such as the
  // "Rate your report" link in a delivery email — mounts the dashboard before
  // the session check (GET /api/auth/me) has resolved, so this runs again as
  // soon as the customer is known instead of only once on mount.
  useEffect(() => {
    if (user?.id) fetchMyReviews();
  }, [user?.id]);

  // Leaving the dashboard must not strand the rendered report's blob URL. The
  // release function arrives with the deferred PDF engine (the page may never
  // import the exporter statically), so it is called through the ref.
  useEffect(() => () => {
    releaseSavedPdfRef.current?.();
    releaseSavedPdfRef.current = null;
  }, []);

  // Open the invited order's review form once the server has said which
  // orders this account may review; explain when it is not one of them.
  useEffect(() => {
    if (!user || !reviewInvite || !reviewsLoaded) return;
    const target = resolveReviewInvite(reviewInvite, reviewableOrders);
    clearReviewInvite();
    setReviewInvite(null);
    setActiveTab('orders');
    if (target) {
      setReviewNotice(null);
      setReviewOrderId(target.orderId);
    } else {
      setReviewNotice({
        tone: 'info',
        text: `Order #${reviewInvite} cannot be reviewed from this account. Reviews open for paid orders once the report has been delivered — if you ordered with a different account, sign in with that one.`
      });
    }
  }, [user, reviewInvite, reviewsLoaded, reviewableOrders]);

  useEffect(() => {
    if (isEditingProfile) return;
    setPName(normalizePersonName(birthProfile?.name || '') || normalizePersonName(user?.name || ''));
    setPDob(normalizeBirthDate(birthProfile?.dob || ''));
    setPTob(normalizeBirthTime(birthProfile?.tob || ''));
    setPGender(birthProfile?.gender || 'M');
    setPLocation(locationFromBirthProfile(birthProfile));
  }, [birthProfile, user?.name, isEditingProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizePersonName(pName)) {
      setProfileSaveError('Please enter your full name.');
      return;
    }
    if (!pDob) {
      setProfileSaveError('Please enter your date of birth.');
      return;
    }
    if (!isValidIsoBirthDate(pDob)) {
      setProfileSaveError('Please enter a valid date of birth that is not in the future.');
      return;
    }
    if (!pTob) {
      setProfileSaveError('Please enter your time of birth.');
      return;
    }
    if (!isValidBirthTime(pTob)) {
      setProfileSaveError('Please enter a valid birth time.');
      return;
    }
    if (!isVerifiedBirthLocation(pLocation)) {
      setProfileSaveError('Please search for and select your birth place so its coordinates and timezone can be saved.');
      return;
    }
    setIsSavingProfile(true);
    setProfileSaveError('');
    setProfileSaveSuccess(false);
    try {
      const result = await updateBirthProfile({
        name: normalizePersonName(pName),
        dob: pDob,
        tob: pTob,
        birthPlace: pLocation.placeName,
        country: pLocation.country,
        latitude: Number(pLocation.latitude),
        longitude: Number(pLocation.longitude),
        timezoneOffsetHours: profileTimezone?.timezoneOffsetHours ?? Number(pLocation.timezoneOffsetHours),
        gender: pGender
      });
      if (result.success) {
        setProfileSaveSuccess(true);
        setIsEditingProfile(false);
        setTimeout(() => setProfileSaveSuccess(false), 4000);
      } else {
        setProfileSaveError(result.message || 'Could not save your birth profile. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to save birth profile:', err);
      setProfileSaveError(err?.message || 'Could not save your birth profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const resetFamilyForm = () => {
    setEditingMemberId(null);
    setFName('');
    setFRelation('OTHER');
    setFDob('');
    setFTob('');
    setFGender('M');
    setFLocation(null);
    setFamilySaveError('');
  };

  const handleAddFamilyMember = () => {
    resetFamilyForm();
    setIsEditingProfile(false);
    setFamilySaveSuccess('');
    setFamilyFormOpen(true);
  };

  /**
   * Edit the account holder's own birth details. There is no separate profile
   * tab: you are the first of the six saved people in the Family Members tab.
   */
  const startEditingSelf = () => {
    setProfileSaveError('');
    setProfileSaveSuccess(false);
    setFamilyFormOpen(false);
    resetFamilyForm();
    setIsEditingProfile(true);
  };

  const handleEditFamilyMember = (member: FamilyMember) => {
    setEditingMemberId(member.id);
    setFName(normalizePersonName(member.name));
    setFRelation(member.relation);
    setFDob(normalizeBirthDate(member.dob));
    setFTob(normalizeBirthTime(member.tob));
    setFGender(member.gender === 'F' ? 'F' : 'M');
    setFLocation(locationFromBirthProfile(member));
    setFamilySaveError('');
    setFamilySaveSuccess('');
    setFamilyFormOpen(true);
  };

  const handleSaveFamilyMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizePersonName(fName)) {
      setFamilySaveError('Please enter the family member\'s full name.');
      return;
    }
    if (!fDob || !isValidIsoBirthDate(fDob)) {
      setFamilySaveError('Please enter a valid date of birth that is not in the future.');
      return;
    }
    if (!fTob || !isValidBirthTime(fTob)) {
      setFamilySaveError('Please enter a valid birth time.');
      return;
    }
    if (!isVerifiedBirthLocation(fLocation)) {
      setFamilySaveError('Please search for and select the birth place so its coordinates and timezone can be saved.');
      return;
    }
    setIsSavingFamily(true);
    setFamilySaveError('');
    setFamilySaveSuccess('');
    try {
      const result = await saveFamilyMember({
        ...(editingMemberId ? { id: editingMemberId } : {}),
        name: normalizePersonName(fName),
        relation: fRelation,
        dob: fDob,
        tob: fTob,
        birthPlace: fLocation.placeName,
        country: fLocation.country,
        latitude: Number(fLocation.latitude),
        longitude: Number(fLocation.longitude),
        timezoneOffsetHours: familyTimezone?.timezoneOffsetHours ?? Number(fLocation.timezoneOffsetHours),
        timeZoneId: familyTimezone?.timeZoneId ?? fLocation.timeZoneId,
        gender: fGender
      });
      if (result.success) {
        setFamilySaveSuccess(editingMemberId ? 'Family member updated.' : 'Family member saved. They can now be picked on any order form — no form filling next time.');
        setFamilyFormOpen(false);
        resetFamilyForm();
        setTimeout(() => setFamilySaveSuccess(''), 5000);
      } else {
        setFamilySaveError(result.message || 'Could not save this family member. Please try again.');
      }
    } catch (err: any) {
      setFamilySaveError(err?.message || 'Could not save this family member. Please try again.');
    } finally {
      setIsSavingFamily(false);
    }
  };

  const handleDeleteFamilyMember = async (member: FamilyMember) => {
    if (!window.confirm(`Remove ${member.name} (${familyRelationLabel(member.relation)}) from your saved family members? Past orders are not affected.`)) {
      return;
    }
    setDeletingMemberId(member.id);
    try {
      const result = await deleteFamilyMember(member.id);
      if (!result.success) {
        setFamilySaveError(result.message || 'Could not remove this family member.');
      }
    } finally {
      setDeletingMemberId(null);
    }
  };

  /** "Order for <name>": an explicit pick handed to the order form. */
  const handleOrderFor = (personKey: string) => {
    setPendingOrderFor(personKey);
    onNavigate('birth-jathagam');
  };

  /** Reports download ONLY in the language chosen when ordering. */
  const reportLanguageName = (code?: string | null): string =>
    code === 'ta' ? 'Tamil' : code === 'hi' ? 'Hindi' : 'English';

  const formatPreparedDate = (value?: string | null): string => {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  /**
   * Downloads the FROZEN report at the same print quality as the emailed copy.
   *
   * The dashboard fetches the immutable snapshot (never the mutable
   * calculated_result), rebuilds the report with the shared HTML builders and
   * captures it at the email profile (200 dpi A4 floor, JPEG 0.88) — the exact pipeline
   * that produced the customer's emailed PDF and the admin's approved preview.
   * There is no server-side renderer to fall back to, so a device that cannot
   * capture the canvas is told plainly instead of being handed a thinner file.
   */
  const handleDownloadReport = async (order: Order, item?: OrderItem) => {
    const key = item ? `${order.id}:${item.id}` : order.id;
    setDownloadingKey(key);
    setDownloadFeedback(null);
    // One saved file at a time: release the previous capture's blob URL.
    releaseSavedPdfRef.current?.();
    setSavedReport(null);
    const personPart = item?.personName ? `_${item.personName.replace(/[^a-zA-Z0-9]+/g, '_')}` : '';
    const fileName = `ASTRO_SIVAM_Report_${order.orderNumber}${personPart}.pdf`;
    const language = normalizeReportLanguage(item?.language || order.language);

    /**
     * THE STALL GUARD.
     *
     * The reported bug was a button that said "Downloading…" and then produced
     * nothing: no file, no message. Every coded failure already sets a visible
     * message, so a silent spinner means the work never settled — a suspended
     * tab, a canvas the device could not allocate, a browser that discarded the
     * page. The guard caps how long the customer can be left guessing: when it
     * fires the button frees up and says exactly what to do. If the capture
     * does finish afterwards, the success message and the save link replace it.
     */
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<'stalled'>(resolve => {
      stallTimer = setTimeout(() => resolve('stalled'), DOWNLOAD_STALL_GUARD_MS);
    });

    const renderWork = (async (): Promise<'finished'> => {
      try {
        // The PDF engine (jspdf + html2canvas, ~780 KB) is fetched HERE, on the
        // click that needs it — the dashboard itself never downloads it.
        const engine = await loadPdfEngine();
        const {
          buildOrderReportHtml,
          mergeOrderPayloadIntoResult,
          downloadPaidReportPdf
        } = engine;
        releaseSavedPdfRef.current = engine.releaseSavedPdfUrls;
        // The frozen snapshot body is fetched only when Download is clicked and
        // only for the signed-in owner — the orders list never carries it.
        const frozen = await api.getMyOrderReportSnapshot(order.id, item?.id);
        // One-chart view of the item, exactly like the admin preview and the
        // email render build it. Kept local so the dashboard never pulls the
        // order-items module (and its invoice builders) into this route chunk.
        const chartOrder: Order = item
          ? {
              ...order,
              serviceType: item.serviceCode,
              language,
              inputPayload: item.inputPayload || {},
              calculatedResult: item.calculatedResult,
              amount: item.unitPrice
            }
          : { ...order, language };
        const result = { ...(frozen.result || {}) };
        // A legacy snapshot without its own stamp still prints the frozen
        // preparation date, never today's date.
        if (!result.generatedAt && frozen.preparedAt) {
          result.generatedAt = frozen.preparedAt;
        }
        const reportHtml = buildOrderReportHtml(
          chartOrder,
          mergeOrderPayloadIntoResult(chartOrder, result),
          language
        );
        if (!reportHtml) {
          throw new Error('No report template exists for this report.');
        }
        const saved = await downloadPaidReportPdf(reportHtml, fileName);
        // Keep the rendered bytes reachable: iOS Safari drops a scripted click
        // this late, so the customer also gets a real link to tap. Same file.
        setSavedReport({ orderId: order.id, url: saved.objectUrl, fileName: saved.fileName });
        // There is only one quality: the file is the emailed document.
        setDownloadFeedback({
          orderId: order.id,
          type: 'success',
          message: REPORT_READY_MESSAGE
        });
      } catch (renderError: any) {
        // The browser is the ONLY renderer now (the server-side mPDF path was
        // removed). Never download a freshly generated substitute: surface the
        // concrete reason — the report is not available yet, or this device could
        // not capture the print-resolution canvas.
        const message = renderError?.message || '';
        setDownloadFeedback({
          orderId: order.id,
          type: 'error',
          message: message === PDF_CAPTURE_ERROR
            ? deviceCaptureFailureMessage()
            : message || 'This report is not available for download yet.'
        });
      }
      return 'finished';
    })();

    const outcome = await Promise.race([renderWork, stalled]);
    if (stallTimer) clearTimeout(stallTimer);
    // Free the button in BOTH cases: a finished render, or a stalled one the
    // customer must be able to retry.
    setDownloadingKey('');
    if (outcome === 'stalled') {
      setDownloadFeedback({
        orderId: order.id,
        type: 'error',
        message: DOWNLOAD_STALLED_MESSAGE
      });
    }
  };

  const handleOpenResendModal = (order: Order) => {
    setResendOrder(order);
    setResendEmailInput(order.userEmail || user?.email || '');
    setResendFeedback(null);
  };

  const handleCloseResendModal = () => {
    setResendOrder(null);
    setResendEmailInput('');
    setResendFeedback(null);
  };

  const handleExecuteResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendOrder) return;

    const emailToUse = (resendEmailInput || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToUse)) {
      setResendFeedback({
        type: 'error',
        message: 'Please enter a valid email address.'
      });
      return;
    }

    setIsResending(true);
    setResendFeedback(null);

    try {
      let payload: any;
      const isCompleted = (resendOrder.status || '').toUpperCase() === 'COMPLETED';
      if (isCompleted) {
        // Hydrate frozen report snapshots from the backend before rendering so
        // self-service email resends are 100% pixel-identical to the approved live preview.
        const hydrateFrozenOrder = async (targetOrder: Order): Promise<Order> => {
          if (targetOrder.calculatedResult) return targetOrder;
          try {
            const snap = await api.getMyOrderReportSnapshot(targetOrder.id);
            if (snap?.success && snap.result) {
              return {
                ...targetOrder,
                calculatedResult: snap.result
              };
            }
          } catch {
            /* fall back to attached order payload if snapshot fetch fails */
          }
          return targetOrder;
        };

        // Sending produces PDFs: the engine is fetched at this click, never
        // when the dashboard was opened.
        const {
          prepareFamilyFulfilPayload,
          generateOrderPdfsBase64,
          deliverOrderPdfPayload
        } = await loadPdfEngine();
        if (resendOrder.items && resendOrder.items.length > 0) {
          const hydratedItems = await Promise.all(
            resendOrder.items.map(async (item) => {
              if (item.calculatedResult) return item;
              try {
                const snap = await api.getMyOrderReportSnapshot(resendOrder.id, item.id);
                if (snap?.success && snap.result) {
                  return { ...item, calculatedResult: snap.result };
                }
              } catch {
                /* keep item as-is if already cached */
              }
              return item;
            })
          );
          const { prepareOrderItemsSendPayload, deliverOrderItemsPdfPayload } = await import('../services/orderItems');
          const rendered = await prepareOrderItemsSendPayload(
            resendOrder,
            hydratedItems,
            message => setResendFeedback({ type: 'success', message })
          );
          payload = await deliverOrderItemsPdfPayload(resendOrder, rendered, 'customer');
        } else if (resendOrder.groupId) {
          const rawFamilyOrders = orders.filter(order => order.groupId === resendOrder.groupId);
          if (rawFamilyOrders.length === 0) {
            throw new Error('The full family order is not available. Refresh your orders and retry.');
          }
          const familyOrders = await Promise.all(rawFamilyOrders.map(hydrateFrozenOrder));
          const prepared = await prepareFamilyFulfilPayload(
            familyOrders,
            resendOrder.groupId,
            progress => setResendFeedback({ type: 'success', message: progress.message }),
            { stagingAudience: 'customer' }
          );
          payload = prepared.payload;
        } else {
          const hydratedOrder = await hydrateFrozenOrder(resendOrder);
          const language = hydratedOrder.language || 'ta';
          const pdfs = await generateOrderPdfsBase64(hydratedOrder, language);
          payload = await deliverOrderPdfPayload(
            hydratedOrder,
            { ...pdfs, language },
            { stagingAudience: 'customer' }
          );
        }
      }

      const res = await api.requestCustomerEmailResend(resendOrder.id, emailToUse, payload);
      if (res && res.success) {
        setResendFeedback({
          type: 'success',
          message: res.message || `Preview-quality reports & tax invoice successfully emailed to ${emailToUse}!`
        });
        // Update local order list
        setOrders(prev => prev.map(o => o.id === resendOrder.id || (resendOrder.groupId && o.groupId === resendOrder.groupId)
          ? { ...o, userEmail: emailToUse, ...(isCompleted ? { emailStatus: 'SENT' } : {}) }
          : o));
      } else {
        setResendFeedback({
          type: 'error',
          message: res?.message || 'Failed to dispatch email. Please check your address and try again.'
        });
      }
    } catch (err: any) {
      setResendFeedback({
        type: 'error',
        message: err.message || 'Error communicating with the mail server.'
      });
    } finally {
      setIsResending(false);
    }
  };

  // Head metadata must render on EVERY branch (the logged-out gate used to
  // return before <SEO>, leaving the document with no title at all).
  const seo = (
    <SEO
      title="Customer Order Dashboard | ASTRO SIVAM"
      description="Track your astrology orders, email-delivery status, and saved family birth details."
      noindex={true}
    />
  );

  if (!user) {
    return (
      <>
        {seo}
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-6 animate-in fade-in">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center mx-auto text-amber-500 shadow-xl shadow-amber-500/10">
          <User className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>User Portal</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 dark:text-white">
            User Sign In Required
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Please log in with your email or Google account to view your past orders, delivery statuses, and access your saved birth chart.
          </p>
          {reviewInvite && (
            <p data-review-invite-pending className="text-sm text-amber-200 max-w-md mx-auto leading-relaxed rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              Sign in with the account you ordered with to review order <strong>#{reviewInvite}</strong> — the review form opens as soon as you are signed in.
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
          <RouteLink
            route="login"
            onNavigate={onNavigate}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-sm font-black text-center shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            Log In to Account
          </RouteLink>
          <RouteLink
            route="register"
            onNavigate={onNavigate}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold text-center border border-slate-700 transition-all cursor-pointer"
          >
            Create Free Account
          </RouteLink>
        </div>
      </div>
    </>
  );
  }

  // The chat speaks the language the customer selected for the report they
  // are asking about; a chat opened without a report follows the site picker.
  const aiLanguage = aiChatOrder ? normalizeReportLanguage(aiChatOrder.language) : appLanguage;

  /**
   * The account holder's own birth details. There is no separate "Saved Birth
   * Profile" tab any more: you are the FIRST of the six saved people in the
   * Family Members tab, and this form edits that card in place.
   */
  const renderSelfBirthForm = () => (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PersonNameField
              id="profile-user-name"
              label="User full name"
              value={pName}
              onChange={setPName}
              placeholder="Your full name"
              size="sm"
            />

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                Gender *
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPGender('M')}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    pGender === 'M'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-500/50'
                  }`}
                >
                  <span>👨 Male</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPGender('F')}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    pGender === 'F'
                      ? 'bg-gradient-to-r from-pink-400 to-rose-500 text-white border-pink-500 font-black shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-pink-500/50'
                  }`}
                >
                  <span>👩 Female</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <BirthDateField
              label="Date of Birth"
              size="sm"
              value={pDob}
              onChange={setPDob}
            />

            <BirthTimeField
              label="Exact Birth Time"
              size="sm"
              value={pTob}
              onChange={setPTob}
            />
          </div>

          <GooglePlacesPicker
            value={pLocation || undefined}
            onChange={setPLocation}
            label="Birth Place (Worldwide Location)"
          />
          <BirthTimeZoneNotice resolution={profileTimezone} date={pDob} time={pTob} />

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingProfile ? 'Saving...' : 'Save Birth Details'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingProfile(false)}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {seo}

      {aiChatOpen && user?.id && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg">
            <AiAstrologerPanel
              customerId={String(user.id)}
              customerName={displayName || 'User'}
              language={aiLanguage}
              orderId={aiChatOrder?.id}
              orderLabel={aiChatOrder ? (aiLanguage === 'ta' ? `அறிக்கை #${aiChatOrder.orderNumber}` : aiLanguage === 'hi' ? `रिपोर्ट #${aiChatOrder.orderNumber}` : `Report #${aiChatOrder.orderNumber}`) : undefined}
              isAdmin={isAdmin}
              onClose={() => setAiChatOpen(false)}
            />
          </div>
        </div>
      )}
      
      {/* Top Welcome Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="space-y-1">
          <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
            Customer Dashboard
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Namaste, {displayName || 'User'}
          </h1>
          <p className="text-xs text-slate-400">
            {user?.email} • {user?.mobile || 'Mobile not set'}
          </p>
        </div>

        {/* Quick Service Ordering Buttons */}
        <div className="flex flex-wrap gap-2">
          <RouteLink
            route="birth-jathagam"
            onNavigate={onNavigate}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Order Birth Jathagam</span>
          </RouteLink>
          <RouteLink
            route="marriage-compatibility"
            onNavigate={onNavigate}
            className="px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Order Wedding Matching</span>
          </RouteLink>
          <RouteLink
            route="baby-naming"
            onNavigate={onNavigate}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Baby className="w-3.5 h-3.5" />
            <span>Order Baby Naming Syllables</span>
          </RouteLink>
          <RouteLink
            route="muhurtham"
            onNavigate={onNavigate}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Order Subha Muhurtham</span>
          </RouteLink>
        </div>
      </div>

      {/* Account alerts — account header area. One saved number, verified
          per app; alerts go only to a verified number and reports/invoices
          are never sent over chat. */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <button
          type="button"
          onClick={() => setAlertsOpen(v => !v)}
          aria-expanded={alertsOpen}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left cursor-pointer"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <MessageCircle className="w-4 h-4 text-emerald-500" />
            WhatsApp &amp; Viber Order Alerts
          </span>
          <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {chatDelivery?.whatsappVerified || chatDelivery?.viberVerified
              ? `${[chatDelivery?.whatsappVerified ? 'WhatsApp' : '', chatDelivery?.viberVerified ? 'Viber' : ''].filter(Boolean).join(' + ')} verified`
              : chatDelivery?.phone ? 'Number saved — not verified' : 'No alert number saved'}
            <ChevronDown className={`w-4 h-4 transition-transform ${alertsOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {alertsOpen && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Get an alert on WhatsApp or Viber when your order is confirmed and when it is completed.
              Save your number and verify it with the one-time code we send in that app — alerts are
              sent <strong>only to a verified number</strong>. Reports and tax invoices are always
              delivered by <strong>email</strong>; PDFs are never sent over chat. Each app is verified
              separately.
            </p>
      <div className="space-y-4">

        {chatFeedback && (
          <div
            role="status"
            className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
              chatFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
            }`}
          >
            {chatFeedback.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{chatFeedback.message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="chat-delivery-phone">
              Mobile number (with country code):
            </label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="chat-delivery-phone"
                type="tel"
                value={chatPhoneInput}
                onChange={e => setChatPhoneInput(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleSaveChatNumber}
              disabled={chatBusy}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {chatBusy ? 'Saving...' : 'Save Number'}
            </button>
            {chatDelivery?.phone && (
              <button
                type="button"
                onClick={handleRemoveChatNumber}
                disabled={chatBusy}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {chatDelivery?.phone ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { channel: 'whatsapp' as const, label: 'WhatsApp', verified: chatDelivery.whatsappVerified, available: chatDelivery.whatsappAvailable },
              { channel: 'viber' as const, label: 'Viber', verified: chatDelivery.viberVerified, available: chatDelivery.viberAvailable }
            ]).map(app => (
              <div key={app.channel} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{app.label}</span>
                  {app.verified ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <ShieldCheck className="w-3 h-3" /> Verified
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/30">
                      Not verified
                    </span>
                  )}
                </div>

                {!app.verified && (
                  <>
                    {chatOtpChannel === app.channel ? (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block" htmlFor={`chat-otp-${app.channel}`}>
                          Enter the 6-digit code sent to {chatDelivery.phone} on {app.label}:
                        </label>
                        <div className="flex gap-2">
                          <input
                            id={`chat-otp-${app.channel}`}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={chatOtpCode}
                            onChange={e => setChatOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm tracking-[0.3em]"
                          />
                          <button
                            type="button"
                            onClick={handleConfirmChatOtp}
                            disabled={chatBusy || chatOtpCode.length !== 6}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRequestChatOtp(app.channel)}
                          disabled={chatBusy}
                          className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Resend code
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRequestChatOtp(app.channel)}
                        disabled={chatBusy || !app.available}
                        className="w-full px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Verify on {app.label}</span>
                      </button>
                    )}
                    {!app.available && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {app.label} alerts are not switched on yet — the button will work once they are enabled. Your reports will keep arriving by email.
                      </p>
                    )}
                  </>
                )}

                {app.verified && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Order status alerts (confirmed / completed) will be sent to {chatDelivery.phone} on {app.label}. Reports and invoices arrive by email.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Save your number first, then verify it on WhatsApp and/or Viber to receive order status alerts. Changing the number later requires verifying the new number again.
          </p>
        )}
      </div>

        {/* Birthday wishes — the customer's OWN opt-in (migration 020). A wish
            goes only to a number verified in that app, only once a year per
            person, and it is text only: reports and invoices stay on email. */}
        {birthdayWishes && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Birthday wishes
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  One short wish on your verified number for each saved birthday —
                  yours{birthdayWishes.savedPeople > 1 ? " and your family members'" : ''} — in {reportLanguageName(appLanguage)}.
                  Text only; reports and invoices stay on email.
                </p>
                {!birthdayWishes.available ? (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Not offered on this site right now — order alerts above keep working.
                  </p>
                ) : !birthdayWishes.numberVerified ? (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Verify your number on WhatsApp or Viber above first.
                  </p>
                ) : birthdayWishes.enabled ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    On — {birthdayWishes.savedPeople > 0
                      ? `${birthdayWishes.savedPeople} saved ${birthdayWishes.savedPeople === 1 ? 'person' : 'people'} covered.`
                      : 'save a birth date and the wishes start.'}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleToggleBirthdayWishes(!birthdayWishes.enabled)}
                disabled={chatBusy || !birthdayWishes.available || !birthdayWishes.numberVerified}
                aria-pressed={birthdayWishes.enabled}
                className={`shrink-0 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  birthdayWishes.enabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white'
                }`}
              >
                {birthdayWishes.enabled ? 'On — turn off' : 'Turn on'}
              </button>
            </div>

            {/* Effortless 1-click Email Birthday Wishes (no WhatsApp/Viber setup needed) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-amber-500" />
                  <span>1-Click Email Birthday Greeting Card</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {birthdayWishes.emailAvailable
                    ? `Instant setup with no phone code required — sent in ${reportLanguageName(appLanguage)} to ${birthdayWishes.userEmail || user?.email}.`
                    : 'Email greeting cards can be switched on as soon as the site administrator enables Email Birthday Wishes.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleEmailBirthdayWishes(!birthdayWishes.emailEnabled)}
                disabled={chatBusy || !birthdayWishes.emailAvailable}
                aria-pressed={!!birthdayWishes.emailEnabled}
                className={`shrink-0 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  birthdayWishes.emailEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {birthdayWishes.emailEnabled ? 'Email On — turn off' : 'Turn on Email Wishes'}
              </button>
            </div>
          </div>
        )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'orders'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>My Orders ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('family')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'family'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Family Members ({savedPeopleDisplay}/{MAX_FAMILY_MEMBERS})</span>
        </button>

        <div className="ml-auto">
          <button
            onClick={() => { fetchOrders(); fetchMyReviews(); }}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 text-xs flex items-center gap-1 cursor-pointer"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Orders View */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          
          {/* Important Email Delivery Notice Banner */}
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <span>Official Email Delivery Policy</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Direct Attachment
                  </span>
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  After approval, your <strong>Report PDF</strong> and <strong>Tax Invoice PDF</strong> are emailed as attachments from <strong>admin@astrosivam.com</strong>. Not in your inbox? Check Spam/Junk.
                </p>
                {/* Owner request (2026-10-21): keep this short. Two facts per
                    line — where the PDFs come from, and what the download icon
                    gives. The button is named as it actually renders
                    ("Update Email & Retry Delivery", and only on an order whose
                    delivery failed); the old copy quoted a "Resend to Email"
                    button that does not exist on this screen. */}
                <p className="text-slate-400 leading-relaxed text-[11.5px]">
                  Tap the download icon beside a name to save its report exactly as prepared on the order date. For family or multi-person orders, open <strong>View details</strong> to see each name and its report. Invoices are email-only; a failed delivery shows <strong>Update Email & Retry Delivery</strong> on that order.
                </p>
              </div>
            </div>
          </div>

          {reviewNotice && (
            <div
              role="status"
              data-review-notice={reviewNotice.tone}
              className={`rounded-2xl px-4 py-3 text-xs flex items-start gap-2.5 border ${
                reviewNotice.tone === 'success'
                  ? 'bg-emerald-950/50 border-emerald-700/70 text-emerald-200'
                  : 'bg-amber-950/50 border-amber-700/70 text-amber-100'
              }`}
            >
              {reviewNotice.tone === 'success'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <span className="flex-1">{reviewNotice.text}</span>
              <button
                type="button"
                onClick={() => setReviewNotice(null)}
                className={reviewNotice.tone === 'success' ? 'text-emerald-300 hover:text-white' : 'text-amber-300 hover:text-white'}
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {reviewOrderId && (() => {
            const target = reviewableOrders.find(entry => entry.orderId === reviewOrderId);
            if (!target) return null;
            return (
              <ReviewFormModal
                orderId={target.orderId}
                orderNumber={target.orderNumber}
                services={target.services}
                existing={myReviews.filter(review => review.orderId === target.orderId)}
                defaults={{ displayName: defaultReviewDisplayName(displayName), location: user?.country || '' }}
                onClose={() => setReviewOrderId(null)}
                onSaved={handleReviewSaved}
              />
            );
          })()}

          {isLoadingOrders ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500" />
              <div className="text-xs font-semibold">Loading your order history...</div>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                No Horoscope Orders Placed Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                You haven&apos;t placed any astrology orders yet. Select a service below to request your certified Vedic horoscope report.
              </p>
              <RouteLink
                route="birth-jathagam"
                onNavigate={onNavigate}
                className="inline-block px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Place Birth Jathagam Order
              </RouteLink>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {orderGroups.map(members => {
                const isFamily = members.length > 1;
                const order = members[0];
                // A legacy family group has one row per chart; show its total,
                // rather than calling the entire bundle free because its first
                // (free-beta) member happens to be first in the list.
                const totalAmount = members.reduce((sum, member) => sum + (Number(member.amount) || 0), 0);
                const isFree = totalAmount === 0 && members.every(member => member.serviceMode === 'FREE_BETA');
                // One status banner per card. For a family it reports the member
                // that most needs the customer: a bounced email must not hide
                // behind three completed siblings, and an order still in the
                // queue must not read as delivered.
                const memberDone = (m: Order) => (m.status || '').toUpperCase() === 'COMPLETED' || (m.status || '').toUpperCase() === 'GENERATED';
                const memberRefunded = (m: Order) => (m.refundStatus || '').toUpperCase() === 'REFUNDED' || (m.status || '').toUpperCase() === 'REFUNDED';
                const bannerOrder = !isFamily
                  ? order
                  : members.find(m => m.emailStatus === 'FAILED')
                    || members.find(m => !memberDone(m) && !memberRefunded(m))
                    || members.find(memberRefunded)
                    || order;
                const bannerCompleted = memberDone(bannerOrder);
                const bannerRefunded = memberRefunded(bannerOrder);
                // One icon beside the relevant name (single order, family member,
                // or multi-person report). Keep download outcomes outside the
                // expandable detail panel so an in-flight download, error, or
                // iOS "Save the PDF" fallback cannot disappear when it closes.
                const downloadableMembers = members.filter(m => memberDone(m) && m.hasPdf);
                const downloadTouchedMember = (id?: string) => Boolean(id) && members.some(m => m.id === id);
                const downloadBandOpen = !!expandedOrders[order.id]
                  || downloadTouchedMember(downloadingKey ? downloadingKey.split(':')[0] : '')
                  || downloadTouchedMember(downloadFeedback?.orderId)
                  || downloadTouchedMember(savedReport?.orderId);
                const orderServiceTitle = (o: Order) =>
                  o.serviceType === 'BIRTH_JATHAGAM' ? 'Birth Jathagam'
                    : o.serviceType === 'MARRIAGE_COMPATIBILITY' ? 'Wedding Matching'
                      : o.serviceType === 'BABY_NAMING' ? 'Baby Naming'
                        : o.serviceType === 'MUHURTHAM' ? 'Subha Muhurtham'
                          : String(o.serviceType || 'Report').replace(/_/g, ' ');
                const memberDownload = (m: Order) => {
                  const item = (m.items || []).find(it => it.reportStatus === 'SENT' && it.hasReportSnapshot !== false);
                  return { item, key: item ? `${m.id}:${item.id}` : m.id };
                };
                const refundAmountText = (o: Order) => {
                  const amount = o.refundAmount != null ? o.refundAmount : Math.round((Number(o.amount) || 0) * 0.9 * 100) / 100;
                  const currency = (o.refundCurrency || o.currency || 'USD').toUpperCase();
                  return `${currency} ${amount.toFixed(2)}`;
                };
                const formatRefundDeadline = (deadline: string) =>
                  new Date(deadline.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                const serviceTitle = order.serviceType === 'MULTI_PERSON'
                  ? 'Multi-Person Order'
                  : orderServiceTitle(order);
                const reviewEligibility = reviewableOrders.find(entry => entry.orderId === order.id) || null;
                const personName = order.inputPayload?.name || order.userName || displayName || 'User';
                const birthPlace = order.inputPayload?.birthPlace;
                const dob = order.inputPayload?.dob;
                const tob = order.inputPayload?.tob;

                // For Marriage Compatibility
                const boy = order.inputPayload?.groom || order.inputPayload?.boy || (order.inputPayload?.groomName ? {
                  name: order.inputPayload.groomName,
                  dob: order.inputPayload.groomDob,
                  tob: order.inputPayload.groomTob,
                  birthPlace: order.inputPayload.groomBirthPlace || order.inputPayload.groomPlace
                } : null) || (order.calculatedResult as any)?.groom || (order.calculatedResult ? {
                  name: (order.calculatedResult as any).groomName,
                  dob: (order.calculatedResult as any).groomDob,
                  tob: (order.calculatedResult as any).groomTob,
                  birthPlace: (order.calculatedResult as any).groomPlace
                } : null);

                const girl = order.inputPayload?.bride || order.inputPayload?.girl || (order.inputPayload?.brideName ? {
                  name: order.inputPayload.brideName,
                  dob: order.inputPayload.brideDob,
                  tob: order.inputPayload.brideTob,
                  birthPlace: order.inputPayload.brideBirthPlace || order.inputPayload.bridePlace
                } : null) || (order.calculatedResult as any)?.bride || (order.calculatedResult ? {
                  name: (order.calculatedResult as any).brideName,
                  dob: (order.calculatedResult as any).brideDob,
                  tob: (order.calculatedResult as any).brideTob,
                  birthPlace: (order.calculatedResult as any).bridePlace
                } : null);

                const orderPersonLabel = isFamily
                  ? `${personName} + ${members.length - 1} more`
                  : order.serviceType === 'MARRIAGE_COMPATIBILITY' && (boy || girl)
                    ? `${boy?.name || 'Groom'} & ${girl?.name || 'Bride'}`
                    : personName;
                // A multi-person order has a different PDF for each report.
                // Its icons belong beside those names in the expanded list,
                // never beside the account holder's name in the summary.
                const singleReportReady = !isFamily && !order.items?.length
                  && memberDone(order) && order.hasPdf && order.hasReportSnapshot !== false;
                const getLangBadge = () => {
                  const l = (order.language || 'ta').toLowerCase();
                  if (l === 'ta' || l === 'tamil') {
                    return (
                      <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-slate-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        Tamil
                      </span>
                    );
                  }
                  if (l === 'hi' || l === 'hindi') {
                    return (
                      <span className="inline-flex items-center rounded-md border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-slate-950 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
                        Hindi
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-slate-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                      English
                    </span>
                  );
                };

                return (
                  <div
                    key={order.groupId || order.id}
                    data-profile-order-card={order.id}
                    className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5 transition-all hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:ring-0 dark:hover:border-amber-500/30"
                  >
                    {/* Admin-style order summary: order, person/service, payment/status, action. */}
                    <div className="grid grid-cols-1 gap-3.5 p-4 sm:p-5 lg:grid-cols-12 lg:items-center lg:gap-4">
                      <div className="min-w-0 space-y-1.5 lg:col-span-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {isFamily ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-400 px-2.5 py-1 text-xs font-black tracking-tight text-slate-950 shadow-xs">
                              <Users className="h-3.5 w-3.5" aria-hidden="true" />
                              Family ({members.length})
                            </span>
                          ) : (
                            <span className="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-black tracking-tight text-slate-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              #{order.orderNumber || order.id}
                            </span>
                          )}
                          {getLangBadge()}
                        </div>
                        {isFamily && order.groupId && (
                          <div className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-300" title={order.groupId}>
                            ID: <span className="font-bold text-slate-950 dark:text-white">{order.groupId}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-300">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-700 dark:text-slate-400" aria-hidden="true" />
                          <span>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent'}</span>
                        </div>
                      </div>

                      {/* Only the report download icon goes to the right of a name. */}
                      <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 dark:border-slate-700/60 dark:bg-slate-800/50 lg:col-span-4">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setExpandedOrders(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                            aria-expanded={!!expandedOrders[order.id]}
                            aria-controls={`order-details-${order.id}`}
                            aria-label={`View details for ${orderPersonLabel}`}
                            className="min-w-0 flex-1 cursor-pointer space-y-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                          >
                            <span className="block truncate text-base font-black tracking-tight text-slate-950 dark:text-white" title={orderPersonLabel}>
                              {orderPersonLabel}
                            </span>
                            <span className="block text-xs font-extrabold text-slate-900 dark:text-amber-400">
                              {isFamily ? `${members.length} charts · one order` : serviceTitle}
                            </span>
                            {!isFamily && (dob || birthPlace) && (
                              <span className="block truncate text-xs font-semibold text-slate-900 dark:text-slate-300">
                                {dob && <span>DOB: <strong className="font-bold text-slate-950 dark:text-white">{dob}</strong></span>}
                                {dob && birthPlace && <span> · </span>}
                                {birthPlace && <span>{birthPlace}</span>}
                              </span>
                            )}
                          </button>
                          {singleReportReady && (
                            <button
                              type="button"
                              onClick={() => handleDownloadReport(order)}
                              disabled={downloadingKey === order.id}
                              title={downloadingKey === order.id ? 'Downloading…' : 'Download Report'}
                              aria-label={downloadingKey === order.id ? 'Downloading…' : `Download Report — ${orderPersonLabel}`}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-950 shadow-xs transition-all hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-60 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                            >
                              {downloadingKey === order.id
                                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                : <Download className="h-4 w-4" aria-hidden="true" />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:col-span-5 lg:grid-cols-5">
                        <div className="min-w-0 space-y-1.5 lg:col-span-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-base font-black tracking-tight text-slate-950 dark:text-amber-400">
                              {isFree ? 'Free Beta' : `$${totalAmount.toFixed(2)} ${order.currency || 'USD'}`}
                            </span>
                            {bannerRefunded ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-2.5 py-0.5 text-xs font-extrabold text-purple-950 dark:border-purple-500/25 dark:bg-purple-500/10 dark:text-purple-300">
                                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Refunded
                              </span>
                            ) : bannerCompleted ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Completed
                              </span>
                            ) : bannerOrder.status === 'CANCELLED' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-extrabold text-rose-950 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                                <AlertCircle className="h-3 w-3" aria-hidden="true" /> Cancelled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                                <Clock className="h-3 w-3" aria-hidden="true" /> Processing
                              </span>
                            )}
                          </div>
                          <div className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-300" title={order.paymentReference || undefined}>
                            Ref: <span className="font-extrabold text-slate-950 dark:text-slate-100">{order.paymentReference || order.orderNumber || 'N/A'}</span>
                          </div>
                          {bannerOrder.emailStatus === 'FAILED' && (
                            <span className="text-xs font-black text-rose-700 dark:text-rose-400">Email Failed</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedOrders(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                          aria-expanded={!!expandedOrders[order.id]}
                          aria-controls={`order-details-${order.id}`}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-black tracking-tight text-slate-950 shadow-xs transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 lg:col-span-2"
                        >
                          <span>{expandedOrders[order.id] ? 'Hide details' : isFamily ? `${members.length} Charts` : order.items?.length ? `${order.items.length} Reports` : 'View details'}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedOrders[order.id] ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Middle: Expanded Details View - Family */}
                    {expandedOrders[order.id] && isFamily && (
                      <div
                        id={`order-details-${order.id}`}
                        className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40 sm:px-5"
                      >
                        {/* Family Members Breakdown */}
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-950 dark:text-amber-400">
                              <Users className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Family Members ({members.length})</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-300">Tap a name for birth details</span>
                          </div>

                          <div className="grid gap-2.5 sm:grid-cols-2">
                            {members.map((member, idx) => {
                              const mName = member.inputPayload?.name || member.userName || `Member #${idx + 1}`;
                              const mGender = member.inputPayload?.gender;
                              const mOpen = !!expandedPersons[member.id];
                              const { item: mItem, key: mKey } = memberDownload(member);
                              const mBusy = downloadingKey === mKey;
                              const mReady = mItem ? true : member.hasReportSnapshot !== false;

                              return (
                                <div key={member.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                  <div className="flex items-center gap-2 px-3.5 py-3">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedPersons(prev => ({ ...prev, [member.id]: !prev[member.id] }))}
                                      aria-expanded={mOpen}
                                      aria-controls={`person-details-${member.id}`}
                                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                                    >
                                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-xs font-black text-slate-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300" aria-hidden="true">
                                        {mName.charAt(0).toUpperCase()}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-black text-slate-950 dark:text-white">{mName}</span>
                                        <span className="block truncate text-xs font-semibold text-slate-900 dark:text-slate-300">
                                          {orderServiceTitle(member)} · {reportLanguageName(member.language)}
                                          {mGender && ` · ${mGender === 'M' || mGender === 'Male' ? 'Male' : 'Female'}`}
                                        </span>
                                        {memberDone(member) && member.hasPdf && !mReady && (
                                          <span className="block text-xs font-bold text-slate-900 dark:text-slate-300">Use email copy</span>
                                        )}
                                      </span>
                                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-700 transition-transform duration-200 dark:text-slate-400 ${mOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    </button>

                                    {memberDone(member) && member.hasPdf && mReady && (
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadReport(member, mItem)}
                                        disabled={mBusy}
                                        title={mBusy ? 'Downloading…' : `Download Report — ${mName}`}
                                        aria-label={mBusy ? 'Downloading…' : `Download Report — ${mName}`}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-950 shadow-xs transition-all hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-60 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                      >
                                        {mBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                                      </button>
                                    )}
                                  </div>

                                  {mOpen && (
                                    <div id={`person-details-${member.id}`} className="border-t border-slate-200 bg-slate-50 px-3.5 py-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
                                      <div className="grid gap-2 text-slate-900 dark:text-slate-300">
                                        <div>Date of Birth: <strong className="font-bold text-slate-950 dark:text-slate-100">{member.inputPayload?.dob || 'N/A'}</strong></div>
                                        <div>Exact Time: <strong className="font-bold text-slate-950 dark:text-slate-100">{member.inputPayload?.tob || 'N/A'}</strong></div>
                                        <div>Birth Place: <strong className="font-bold text-slate-950 dark:text-slate-100">{member.inputPayload?.birthPlace || 'N/A'}</strong></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Order & Payment Information */}
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-950 dark:text-amber-400">
                            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Order & Payment Information</span>
                          </div>
                          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-300">Ordered On: </span>
                              <span className="font-extrabold text-slate-950 dark:text-white">
                                {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-300">Payment Mode: </span>
                              <span className={isFree ? 'font-black text-slate-950 dark:text-amber-400' : 'font-black text-slate-950 dark:text-emerald-400'}>
                                {isFree ? 'Free Beta (1 Free Report)' : `Paid (${order.currency || 'USD'} $${totalAmount.toFixed(2)})`}
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-300">Payment Reference: </span>
                              <span className="truncate font-mono font-bold text-slate-950 dark:text-slate-100">
                                {order.paymentReference || 'Direct / Online'}
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-300">Delivery Email: </span>
                              <span className="truncate font-bold text-slate-950 dark:text-amber-300">
                                {order.userEmail}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Middle: Expanded Details View - Single Order */}
                    {expandedOrders[order.id] && !isFamily && (
                      <div
                        id={`order-details-${order.id}`}
                        className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40 sm:px-5"
                      >
                        <div className="grid gap-3 md:grid-cols-2">
                          {/* User & Birth Details */}
                          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-950 dark:text-amber-400">
                              <User className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>User & Birth Details</span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              {order.serviceType === 'MARRIAGE_COMPATIBILITY' && (boy || girl) ? (
                                <div className="space-y-2">
                                  {boy && (
                                    <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                                      <div className="font-black text-slate-950 dark:text-white">Groom: {boy.name || 'Groom'}</div>
                                      <div className="font-semibold text-slate-900 dark:text-slate-300">Date of Birth: <span className="font-bold text-slate-950 dark:text-slate-100">{boy.dob || 'N/A'}</span> · Exact Time: <span className="font-bold text-slate-950 dark:text-slate-100">{boy.tob || 'N/A'}</span></div>
                                      <div className="font-semibold text-slate-900 dark:text-slate-300">Birth Place: <span className="font-bold text-slate-950 dark:text-slate-100">{boy.birthPlace || 'N/A'}</span></div>
                                    </div>
                                  )}
                                  {girl && (
                                    <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                                      <div className="font-black text-slate-950 dark:text-white">Bride: {girl.name || 'Bride'}</div>
                                      <div className="font-semibold text-slate-900 dark:text-slate-300">Date of Birth: <span className="font-bold text-slate-950 dark:text-slate-100">{girl.dob || 'N/A'}</span> · Exact Time: <span className="font-bold text-slate-950 dark:text-slate-100">{girl.tob || 'N/A'}</span></div>
                                      <div className="font-semibold text-slate-900 dark:text-slate-300">Birth Place: <span className="font-bold text-slate-950 dark:text-slate-100">{girl.birthPlace || 'N/A'}</span></div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <span className="font-semibold text-slate-900 dark:text-slate-300">Date of Birth: </span>
                                    <span className="font-bold text-slate-950 dark:text-slate-100">{dob || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-900 dark:text-slate-300">Exact Time: </span>
                                    <span className="font-bold text-slate-950 dark:text-slate-100">{tob || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-900 dark:text-slate-300">Birth Place: </span>
                                    <span className="font-bold text-slate-950 dark:text-slate-100">{birthPlace || 'N/A'}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Order & Payment Information */}
                          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-950 dark:text-amber-400">
                              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Order & Payment Information</span>
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-slate-300">Ordered On: </span>
                                <span className="font-bold text-slate-950 dark:text-slate-100">
                                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-slate-300">Payment Mode: </span>
                                <span className={isFree ? 'font-bold text-slate-950 dark:text-amber-400' : 'font-bold text-slate-950 dark:text-emerald-400'}>
                                  {isFree ? 'Free Beta (1 Free Report)' : `Paid (${order.currency} $${order.amount})`}
                                </span>
                              </div>
                              {order.paymentReference && (
                                <div>
                                  <span className="font-semibold text-slate-900 dark:text-slate-300">Payment Reference: </span>
                                  <span className="font-mono font-bold text-slate-950 dark:text-slate-100">
                                    {order.paymentReference}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-slate-300">Delivery Email: </span>
                                <span className="font-bold text-slate-950 dark:text-amber-300">
                                  {order.userEmail}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Multi-person reports: one icon beside each report name. */}
                        {(order.items?.length || 0) > 0 && (
                          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-950 dark:text-amber-400">
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Reports ({order.items!.length})</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {(order.items || []).map(item => {
                                const itemReady = memberDone(order) && order.hasPdf
                                  && item.reportStatus === 'SENT' && item.hasReportSnapshot !== false;
                                const itemService = item.serviceCode === 'BIRTH_JATHAGAM'
                                  ? 'Birth Jathagam'
                                  : item.serviceCode === 'MARRIAGE_COMPATIBILITY'
                                    ? 'Wedding Matching'
                                    : item.serviceCode === 'BABY_NAMING'
                                      ? 'Baby Naming'
                                      : item.serviceCode === 'MUHURTHAM'
                                        ? 'Subha Muhurtham'
                                        : String(item.serviceCode).replace(/_/g, ' ');
                                const itemKey = `${order.id}:${item.id}`;
                                return (
                                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-bold text-slate-950 dark:text-white">{item.personName || 'Report'}</div>
                                      <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-300">{itemService} · {reportLanguageName(item.language || order.language)}</div>
                                      {!itemReady && (
                                        <div className="text-xs font-medium text-slate-700 dark:text-slate-400">
                                          {item.reportStatus === 'SENT' && item.hasReportSnapshot === false ? 'Use email copy' : 'Available after delivery'}
                                        </div>
                                      )}
                                    </div>
                                    {itemReady && (
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadReport(order, item)}
                                        disabled={downloadingKey === itemKey}
                                        title={downloadingKey === itemKey ? 'Downloading…' : `Download Report — ${item.personName || 'report'}`}
                                        aria-label={downloadingKey === itemKey ? 'Downloading…' : `Download Report — ${item.personName || 'report'}`}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-950 shadow-xs transition-all hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-60 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                      >
                                        {downloadingKey === itemKey
                                          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                          : <Download className="h-4 w-4" aria-hidden="true" />}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {!order.items?.length && memberDone(order) && order.hasPdf && order.hasReportSnapshot === false && (
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-400">
                            Report download unavailable — please use the PDF copy emailed to you.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Bottom Row: Delivery Status & Conditional Email Retry */}
                    <div className="flex flex-col items-stretch justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:px-5">
                      <div className="flex-1 min-w-0">
                        {bannerOrder.emailStatus === 'FAILED' ? (
                          <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 dark:border-rose-800/60 dark:bg-rose-950/40">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-black text-rose-950 dark:text-rose-200">Email Delivery Failed / Bounced</div>
                              <div className="text-xs font-medium leading-relaxed text-rose-950 dark:text-rose-300">
                                We could not deliver your report to <strong className="font-bold text-rose-950 dark:text-white">{bannerOrder.userEmail}</strong>. Please update your email address below to receive your Vedic Report.
                              </div>
                            </div>
                          </div>
                        ) : bannerRefunded ? (
                          <div className="flex items-start gap-2.5 rounded-lg border border-purple-300 bg-purple-50 px-3.5 py-2.5 dark:border-purple-800/60 dark:bg-purple-950/40">
                            <RotateCcw className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-black text-purple-950 dark:text-purple-200">Refund Approved — {refundAmountText(order)}</div>
                              <div className="text-xs font-medium leading-relaxed text-purple-950 dark:text-purple-300">
                                Order cancelled before admin approval. 90% pre-approval refund applies.
                                {order.refundDeadline && (
                                  <> Settles on or before <strong className="font-bold text-purple-950 dark:text-white">{formatRefundDeadline(order.refundDeadline)}</strong> (3 working days).</>
                                )}
                                {order.refundMethod && order.refundMethod.toUpperCase() === 'GATEWAY' && order.refundReference && (
                                  <> Sent back by payment provider (Ref: <strong className="font-bold text-purple-950 dark:text-white">{order.refundReference}</strong>).</>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : bannerCompleted ? (
                          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 dark:border-emerald-800/60 dark:bg-emerald-950/30">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-black text-emerald-950 dark:text-emerald-200">Report Complete & Emailed</div>
                              <div className="text-xs font-medium leading-relaxed text-emerald-950 dark:text-emerald-300">
                                Your Vedic Horoscope Report and Tax Invoice PDFs were emailed to <strong className="font-bold text-emerald-950 dark:text-white">{bannerOrder.userEmail}</strong>.
                              </div>
                            </div>
                          </div>
                        ) : order.status === 'CANCELLED' ? (
                          <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 font-bold text-rose-950 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>This order was cancelled.</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-black text-amber-950 dark:text-amber-200">Processing in Vedic Astrology Queue</div>
                              <div className="text-xs font-medium leading-relaxed text-amber-950 dark:text-amber-300">
                                Our India Vedic scholars are reviewing your planetary charts. PDF Report and Tax Invoice will be emailed to <strong className="font-bold text-amber-950 dark:text-white">{bannerOrder.userEmail}</strong>.
                              </div>
                              <div className="pt-0.5 text-xs font-medium text-amber-950 dark:text-amber-400">
                                Eligible for <strong className="font-bold text-amber-950 dark:text-white">90% refund</strong> if cancelled before admin approval (contact <a href="mailto:admin@astrosivam.com" className="font-bold underline hover:text-black dark:hover:text-amber-200">admin@astrosivam.com</a>, settles in 3 working days).
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Keep delivery recovery and report chat outside the detail toggle. */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {(bannerOrder.emailStatus === 'FAILED' || bannerOrder.status === 'PENDING' || bannerOrder.status === 'PENDING_APPROVAL') && (
                          <button
                            type="button"
                            onClick={() => handleOpenResendModal(bannerOrder)}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black shadow-xs transition-colors ${
                              bannerOrder.emailStatus === 'FAILED'
                                ? 'border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300'
                                : 'border-slate-300 bg-white text-slate-950 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700'
                            }`}
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{bannerOrder.emailStatus === 'FAILED' ? 'Update Email & Retry Delivery' : 'Request Email Resend'}</span>
                          </button>
                        )}
                        {order.status === 'COMPLETED' && order.hasPdf && order.emailStatus === 'SENT' && order.emailSentAt && (
                          <button
                            type="button"
                            onClick={() => { setAiChatOrder(order); setAiChatOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-950 shadow-xs transition-colors hover:bg-slate-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                            Ask Astrologer
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Feedback and the Safari save link survive collapsing the card. */}
                    {downloadBandOpen && downloadableMembers.map(downloadOrder => {
                      const order = downloadOrder;
                      if (downloadFeedback?.orderId !== order.id && savedReport?.orderId !== order.id) return null;
                      return (
                        <div key={`download-${order.id}`} className="space-y-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5" data-frozen-download={order.id}>
                          {downloadFeedback?.orderId === order.id && (
                            <div
                              role="status"
                              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                                downloadFeedback.type === 'success'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                                  : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
                              }`}
                            >
                              {downloadFeedback.type === 'success'
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                              <span>{downloadFeedback.message}</span>
                            </div>
                          )}

                          {/* Save the PDF Fallback Link for Safari */}
                          {savedReport?.orderId === order.id && (
                            <div
                              data-saved-report={order.id}
                              className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-800/70 dark:bg-emerald-950/40"
                            >
                              <p className="break-all text-xs text-emerald-800 dark:text-emerald-200">
                                <FileText className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                                {savedReport.fileName}
                              </p>
                              <a
                                href={savedReport.url}
                                download={savedReport.fileName}
                                rel="noopener"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-95 transition-all"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Save the PDF</span>
                              </a>
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                On iPhone/iPad this opens the report in Safari — tap Share, then “Save to Files”.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Verified Review Section */}
                    {reviewEligibility && (
                      <OrderReviewStrip
                        eligibility={reviewEligibility}
                        reviews={myReviews.filter(review => review.orderId === order.id)}
                        onOpen={() => { setReviewNotice(null); setReviewOrderId(order.id); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Family Members — saved birth details (max {MAX_FAMILY_MEMBERS}).
          Picked explicitly on order forms; never auto-filled. */}
      {activeTab === 'family' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* Guided Easy Birthday Wishes Banner right where Birth Details live */}
          {birthdayWishes && (
            <div className="p-4 sm:p-5 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Automatic Birthday Wishes ({reportLanguageName(appLanguage)})</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    Receive a warm non-promotional birthday blessing automatically for yourself and every saved family member below — in one click by Email, or on your verified WhatsApp / Viber number.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {birthdayWishes.emailAvailable && (
                    <button
                      type="button"
                      onClick={() => handleToggleEmailBirthdayWishes(!birthdayWishes.emailEnabled)}
                      disabled={chatBusy}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                        birthdayWishes.emailEnabled
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      }`}
                    >
                      {birthdayWishes.emailEnabled ? '✓ Email Wishes On' : '1-Click Enable Email Wishes'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAlertsOpen(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    {birthdayWishes.enabled ? '✓ Chat Wishes On' : 'WhatsApp / Viber Setup'}
                  </button>
                </div>
              </div>

              {chatFeedback && (
                <p className={`text-xs font-medium ${chatFeedback.type === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  {chatFeedback.message}
                </p>
              )}

              {(birthdayWishes.upcomingBirthdays || []).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(birthdayWishes.upcomingBirthdays || []).map(item => (
                    <span
                      key={item.personKey}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      <span>{item.name || 'Saved Profile'}</span>
                      <span className="text-amber-700 dark:text-amber-400 font-bold">
                        {item.daysUntil === 0
                          ? '· Today!'
                          : item.daysUntil === 1
                            ? '· Tomorrow'
                            : `· in ${item.daysUntil}d`}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Saved Family Members
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl leading-relaxed">
                You plus up to {MAX_FAMILY_MEMBERS - 1} family members — {MAX_FAMILY_MEMBERS} saved people in total,
                yourself included. Save the birth details once, then pick a name on any order form and it fills
                itself — no typing. Order forms otherwise always start blank; nobody&apos;s details are taken
                automatically.
              </p>
            </div>
            {!familyFormOpen && !isEditingProfile && savedPeopleCount < MAX_FAMILY_MEMBERS && (
              <button
                onClick={handleAddFamilyMember}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Family Member</span>
              </button>
            )}
          </div>

          {familySaveSuccess && (
            <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{familySaveSuccess}</span>
            </div>
          )}

          {familySaveError && !familyFormOpen && (
            <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{familySaveError}</span>
            </div>
          )}

          {profileSaveSuccess && !isEditingProfile && (
            <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Your birth details were updated.</span>
            </div>
          )}

          {isEditingProfile && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3" data-saved-person-form="self">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">My Birth Details</h4>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  Close
                </button>
              </div>
              {profileSaveError && (
                <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{profileSaveError}</span>
                </div>
              )}
              {renderSelfBirthForm()}
            </div>
          )}

          {familyFormOpen ? (
            <form onSubmit={handleSaveFamilyMember} className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingMemberId ? 'Edit Family Member' : 'Add Family Member'}
              </h4>

              {familySaveError && (
                <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{familySaveError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PersonNameField
                  id="family-member-name"
                  label="Full name"
                  value={fName}
                  onChange={setFName}
                  placeholder="Family member's full name"
                  size="sm"
                />

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="family-member-relation">
                    Relation:
                  </label>
                  <select
                    id="family-member-relation"
                    value={fRelation}
                    onChange={e => {
                      const nextRelation = e.target.value as FamilyRelation;
                      setFRelation(nextRelation);
                      if (['MOTHER', 'DAUGHTER', 'SISTER'].includes(nextRelation)) {
                        setFGender('F');
                      } else if (['FATHER', 'SON', 'BROTHER'].includes(nextRelation)) {
                        setFGender('M');
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold cursor-pointer"
                  >
                    {FAMILY_RELATION_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                    Gender *
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFGender('M')}
                      className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        fGender === 'M'
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-500/50'
                      }`}
                    >
                      <span>👨 Male</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFGender('F')}
                      className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        fGender === 'F'
                          ? 'bg-gradient-to-r from-pink-400 to-rose-500 text-white border-pink-500 font-black shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-pink-500/50'
                      }`}
                    >
                      <span>👩 Female</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <BirthDateField
                  label="Date of Birth"
                  size="sm"
                  value={fDob}
                  onChange={setFDob}
                />

                <BirthTimeField
                  label="Exact Birth Time"
                  size="sm"
                  value={fTob}
                  onChange={setFTob}
                />
              </div>

              <GooglePlacesPicker
                value={fLocation || undefined}
                onChange={setFLocation}
                label="Birth Place (Worldwide Location)"
              />
              <BirthTimeZoneNotice resolution={familyTimezone} date={fDob} time={fTob} />

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingFamily}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingFamily ? 'Saving...' : editingMemberId ? 'Save Changes' : 'Save Family Member'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setFamilyFormOpen(false); resetFamilyForm(); }}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* YOU are the first of the six saved people — there is no
                  separate saved birth profile anywhere. */}
              <div
                className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/60 space-y-3"
                data-saved-person="self"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                      {birthProfile?.name || displayName || 'Myself'}
                    </div>
                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Myself (you)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={startEditingSelf}
                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit my birth details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {birthProfile ? (
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <div>
                      <span className="text-slate-400">Born:</span>{' '}
                      <strong>{birthProfile.dob}</strong>
                      {birthProfile.tob ? <> at <strong>{birthProfile.tob}</strong></> : null}
                      {' '}({birthProfile.gender === 'F' ? 'Female' : 'Male'})
                    </div>
                    <div>
                      <span className="text-slate-400">Place:</span>{' '}
                      <strong>{birthProfile.birthPlace}{birthProfile.country ? `, ${birthProfile.country}` : ''}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Add your own birth details once — you count as one of the {MAX_FAMILY_MEMBERS} saved people.
                  </p>
                )}

                <button
                  type="button"
                  onClick={birthProfile ? () => handleOrderFor('self') : startEditingSelf}
                  className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {birthProfile ? <Compass className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{birthProfile ? 'Order for Myself' : 'Add My Birth Details'}</span>
                </button>
              </div>

              {familyMembers.map(member => (
                <div
                  key={member.id}
                  className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3"
                  data-family-member={member.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{member.name}</div>
                      <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {familyRelationLabel(member.relation)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditFamilyMember(member)}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title={`Edit ${member.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFamilyMember(member)}
                        disabled={deletingMemberId === member.id}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                        title={`Remove ${member.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <div>
                      <span className="text-slate-400">Born:</span>{' '}
                      <strong>{member.dob}</strong>
                      {member.tob ? <> at <strong>{member.tob}</strong></> : null}
                      {' '}({member.gender === 'F' ? 'Female' : 'Male'})
                    </div>
                    <div>
                      <span className="text-slate-400">Place:</span>{' '}
                      <strong>{member.birthPlace}{member.country ? `, ${member.country}` : ''}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOrderFor(member.id)}
                    className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Order for {member.name}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {!familyFormOpen && !isEditingProfile && savedPeopleCount >= MAX_FAMILY_MEMBERS && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              You have saved the maximum of {MAX_FAMILY_MEMBERS} people (yourself included). Remove one to add another.
            </p>
          )}
        </div>
      )}

      {/* Modal: Resend Email / Update Delivery Address */}
      {resendOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl text-white space-y-5">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Mail className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Email Re-Delivery Request</h3>
              </div>
              <button
                onClick={handleCloseResendModal}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Brief */}
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Order:</span>
                <span className="font-mono font-bold text-amber-300">#{resendOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">User:</span>
                <span className="font-bold text-white">
                  {resendOrder.inputPayload?.name || resendOrder.userName || 'User'}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Current Status:</span>
                <span className={resendOrder.status === 'COMPLETED' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {resendOrder.status === 'COMPLETED' ? '✓ Completed' : '⏳ In Processing'}
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleExecuteResend} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200 block">
                  Recipient Email Address:
                </label>
                <input
                  type="email"
                  required
                  value={resendEmailInput}
                  onChange={e => setResendEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl text-white text-xs outline-hidden transition-colors"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  If your email address had a typo or you prefer receiving documents on a different email address, enter it above.
                </p>
              </div>

              {resendFeedback && (
                <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
                  resendFeedback.type === 'success'
                    ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/50 border-rose-800 text-rose-300'
                }`}>
                  {resendFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  )}
                  <span className="leading-relaxed">{resendFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isResending}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Dispatching Email...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Resend Documents</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCloseResendModal}
                  disabled={isResending}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
