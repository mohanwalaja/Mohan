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
  Loader2
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
  // Owner request (2026-10-21): the My Orders cards must stay small. A collapsed
  // card shows the name and the order badges only; the birth details and the
  // payment block are one tap away behind the name row. Keyed by order id so
  // expanding one card never opens its neighbours.
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
        setChatPhoneInput(result.chatDelivery.phone || '');
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
        // Sending produces PDFs: the engine is fetched at this click, never
        // when the dashboard was opened.
        const {
          prepareFamilyFulfilPayload,
          generateOrderPdfsBase64,
          deliverOrderPdfPayload
        } = await loadPdfEngine();
        if (resendOrder.groupId) {
          const familyOrders = orders.filter(order => order.groupId === resendOrder.groupId);
          if (familyOrders.length === 0) {
            throw new Error('The full family order is not available. Refresh your orders and retry.');
          }
          const prepared = await prepareFamilyFulfilPayload(
            familyOrders,
            resendOrder.groupId,
            progress => setResendFeedback({ type: 'success', message: progress.message }),
            { stagingAudience: 'customer' }
          );
          payload = prepared.payload;
        } else {
          const language = resendOrder.language || 'ta';
          const pdfs = await generateOrderPdfsBase64(resendOrder, language);
          payload = await deliverOrderPdfPayload(
            resendOrder,
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
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Gender:
              </label>
              <select
                value={pGender}
                onChange={e => setPGender(e.target.value as 'M' | 'F')}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
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
            label="Birth Place (Google Maps)"
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
              orderLabel={aiChatOrder ? `Report #${aiChatOrder.orderNumber}` : undefined}
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
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
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
                    line — where the PDFs come from, and what Download Report
                    gives. The button is named as it actually renders
                    ("Update Email & Retry Delivery", and only on an order whose
                    delivery failed); the old copy quoted a "Resend to Email"
                    button that does not exist on this screen. */}
                <p className="text-slate-400 leading-relaxed text-[11.5px]">
                  <strong>Download Report</strong> saves the report exactly as prepared on your order date — never recalculated, so a new period needs a new order. Invoices are email-only; a failed delivery shows <strong>Update Email & Retry Delivery</strong> on that order.
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
                const isCompleted = order.status === 'COMPLETED' || order.status === 'GENERATED';
                const isFree = order.serviceMode === 'FREE_BETA';
                // Refund & Cancellation Policy: 90% back if cancelled BEFORE admin
                // approval, settled within 3 working days; non-refundable after
                // approval. Both values below come from the server, never guessed.
                const isRefunded = (order.refundStatus || '').toUpperCase() === 'REFUNDED' || (order.status || '').toUpperCase() === 'REFUNDED';
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
                const refundAmountText = (o: Order) => {
                  const amount = o.refundAmount != null ? o.refundAmount : Math.round((Number(o.amount) || 0) * 0.9 * 100) / 100;
                  const currency = (o.refundCurrency || o.currency || 'USD').toUpperCase();
                  return `${currency} ${amount.toFixed(2)}`;
                };
                const formatRefundDeadline = (deadline: string) =>
                  new Date(deadline.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                const getServiceName = () => {
                  if (order.serviceType === 'BIRTH_JATHAGAM') {
                    return {
                      icon: '🪐',
                      title: 'Birth Jathagam',
                      sub: 'Comprehensive Birth Horoscope Report'
                    };
                  }
                  if (order.serviceType === 'MARRIAGE_COMPATIBILITY') {
                    return {
                      icon: '💍',
                      title: 'Wedding Matching',
                      sub: '10-Porutham Wedding Synastry'
                    };
                  }
                  if (order.serviceType === 'BABY_NAMING') {
                    return {
                      icon: '👶',
                      title: 'Baby Naming Syllables',
                      sub: 'Peyar Sooduthal & Nakshatra Syllables'
                    };
                  }
                  if (order.serviceType === 'MUHURTHAM') {
                    return {
                      icon: '📅',
                      title: 'Subha Muhurtham',
                      sub: '6 Months of Auspicious Dates'
                    };
                  }
                  if (order.serviceType === 'MULTI_PERSON') {
                    // One order, up to 6 people, one report per service bought.
                    const peopleCount = order.persons?.length || 0;
                    const reportCount = order.items?.length || 0;
                    return {
                      icon: '👪',
                      title: 'Multi-Person Order',
                      sub: `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} · ${reportCount} ${reportCount === 1 ? 'report' : 'reports'}`
                    };
                  }
                  return {
                    icon: '📜',
                    title: String(order.serviceType).replace(/_/g, ' '),
                    sub: 'Vedic Astrology Consultation'
                  };
                };

                const serviceInfo = getServiceName();
                const reviewEligibility = reviewableOrders.find(entry => entry.orderId === order.id) || null;
                const personName = order.inputPayload?.name || order.userName || displayName || 'User';
                const birthPlace = order.inputPayload?.birthPlace;
                const dob = order.inputPayload?.dob;
                const tob = order.inputPayload?.tob;
                const gender = order.inputPayload?.gender;

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

                const getLangBadge = () => {
                  const l = (order.language || 'ta').toLowerCase();
                  if (l === 'ta' || l === 'tamil') {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-950/60 text-amber-300 border border-amber-700/60">
                        <span>🇮🇳</span>
                        <span>Tamil</span>
                      </span>
                    );
                  }
                  if (l === 'hi' || l === 'hindi') {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-orange-950/60 text-orange-300 border border-orange-700/60">
                        <span>🕉️</span>
                        <span>Hindi</span>
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-blue-950/60 text-blue-300 border border-blue-700/60">
                      <span>🇬🇧</span>
                      <span>English</span>
                    </span>
                  );
                };

                return (
                  <div
                    key={order.groupId || order.id}
                    className="bg-slate-900/95 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 sm:p-6 shadow-lg transition-all space-y-4"
                  >
                    {/* Top Row: Order Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-amber-950/70 text-amber-300 border border-amber-700/60">
                          #{order.orderNumber || order.id}
                        </span>

                        <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border ${
                          order.serviceType === 'BIRTH_JATHAGAM'
                            ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                            : order.serviceType === 'MARRIAGE_COMPATIBILITY'
                            ? 'bg-pink-950/60 text-pink-300 border-pink-700/60'
                            : order.serviceType === 'MULTI_PERSON'
                            ? 'bg-violet-950/60 text-violet-300 border-violet-700/60'
                            : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                        }`}>
                          <span className="mr-1">{serviceInfo.icon}</span>
                          <span className="font-extrabold">{serviceInfo.title}</span>
                        </span>

                        {getLangBadge()}

                        {/* A family bundle is one checkout and one payment, so it
                            is one card; the pill says how many charts are in it
                            before the customer expands anything. */}
                        {isFamily && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-violet-950/60 text-violet-300 border border-violet-700/60">
                            <span>👪</span>
                            <span>{members.length} charts · one order</span>
                          </span>
                        )}
                      </div>

                      {/* This report-specific shortcut appears after delivery; the
                          global floating launcher follows the same server entitlement. */}
                      {order.status === 'COMPLETED' && order.hasPdf && order.emailStatus === 'SENT' && order.emailSentAt && (
                        <button
                          onClick={() => { setAiChatOrder(order); setAiChatOpen(true); }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-600/40 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Ask about this report</span>
                        </button>
                      )}
                    </div>

                    {/* Owner request (2026-10-21): collapsed, a card is one line of
                        identity — the name and gender, under the order badges.
                        Tapping it expands the birth details and the payment block;
                        nothing actionable (status banner, buttons, downloads) is
                        ever hidden behind it. */}
                    <button
                      type="button"
                      onClick={() => setExpandedOrders(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                      aria-expanded={!!expandedOrders[order.id]}
                      aria-controls={`order-details-${order.id}`}
                      className="w-full flex items-center justify-between gap-3 rounded-xl px-1.5 py-1 text-left cursor-pointer hover:bg-slate-800/40 transition-colors"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-bold text-white">
                          {isFamily
                            ? `${personName} + ${members.length - 1} more`
                            : order.serviceType === 'MARRIAGE_COMPATIBILITY' && (boy || girl)
                              ? `${boy?.name || 'Groom'} & ${girl?.name || 'Bride'}`
                              : personName}
                        </span>
                        {gender && order.serviceType !== 'MARRIAGE_COMPATIBILITY' && (
                          <span className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {gender === 'M' || gender === 'Male' ? 'Male' : 'Female'}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-amber-300">
                        {expandedOrders[order.id]
                          ? 'Hide details'
                          : isFamily ? 'View names & details' : 'View details'}
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedOrders[order.id] ? 'rotate-180' : ''}`} />
                      </span>
                    </button>

                    {/* Middle, FAMILY: one card for the whole bundle (owner
                        request, 2026-10-21). The payment is stated once, then one
                        row per chart; a tap on a name opens that person's birth
                        details — names first, details behind the name. */}
                    {expandedOrders[order.id] && isFamily && (
                    <div id={`order-details-${order.id}`} className="space-y-3">
                      <div className="space-y-2 bg-slate-950/50 rounded-xl p-3.5 border border-slate-800/60 text-xs">
                        <div className="text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                          Order & Payment Information
                        </div>
                        <div className="space-y-1.5 text-[11.5px]">
                          <div className="flex justify-between text-slate-300">
                            <span className="text-slate-400">Ordered On:</span>
                            <strong className="text-slate-200">
                              {order.createdAt
                                ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                : 'N/A'}
                            </strong>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span className="text-slate-400">Payment Mode:</span>
                            <strong className={isFree ? 'text-amber-400' : 'text-emerald-400'}>
                              {isFree ? '★ Free Beta (Your 1 Free Report)' : `Paid (${order.currency} $${order.amount})`}
                            </strong>
                          </div>
                          {order.paymentReference && (
                            <div className="flex justify-between text-slate-300">
                              <span className="text-slate-400">Payment Ref:</span>
                              <span className="font-mono text-[11px] text-slate-200">{order.paymentReference}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-300">
                            <span className="text-slate-400">Delivery Email:</span>
                            <strong className="text-amber-300">{order.userEmail}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10.5px] uppercase font-bold text-amber-400 tracking-wider">
                          Family Members & Birth Details
                        </div>
                        {members.map(member => {
                          const mName = member.inputPayload?.name || member.userName || 'Family member';
                          const mGender = member.inputPayload?.gender;
                          const mOpen = !!expandedPersons[member.id];
                          return (
                            <div key={member.id} className="bg-slate-950/50 rounded-xl border border-slate-800/60">
                              <button
                                type="button"
                                onClick={() => setExpandedPersons(prev => ({ ...prev, [member.id]: !prev[member.id] }))}
                                aria-expanded={mOpen}
                                aria-controls={`person-details-${member.id}`}
                                className="w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left cursor-pointer hover:bg-slate-800/40 transition-colors"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-xs font-bold text-white">{mName}</span>
                                  {mGender && (
                                    <span className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                                      {mGender === 'M' || mGender === 'Male' ? 'Male' : 'Female'}
                                    </span>
                                  )}
                                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                                    member.emailStatus === 'FAILED'
                                      ? 'bg-rose-950/60 text-rose-300 border-rose-700/60'
                                      : memberDone(member)
                                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                                        : 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                                  }`}>
                                    {member.emailStatus === 'FAILED' ? 'Email failed' : memberDone(member) ? 'Delivered' : 'In progress'}
                                  </span>
                                </span>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-amber-300 transition-transform ${mOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {mOpen && (
                                <div id={`person-details-${member.id}`} className="space-y-1.5 px-3.5 pb-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-300 text-[11.5px]">
                                    {member.inputPayload?.dob && (
                                      <div>
                                        <span className="text-slate-400 font-medium">Date of Birth:</span>{' '}
                                        <strong className="text-amber-200 font-semibold">{member.inputPayload.dob}</strong>
                                      </div>
                                    )}
                                    {member.inputPayload?.tob && (
                                      <div>
                                        <span className="text-slate-400 font-medium">Exact Time:</span>{' '}
                                        <strong className="text-amber-200 font-semibold">{member.inputPayload.tob}</strong>
                                      </div>
                                    )}
                                    {member.inputPayload?.birthPlace && (
                                      <div className="sm:col-span-2">
                                        <span className="text-slate-400 font-medium">Birth Place:</span>{' '}
                                        <strong className="text-slate-200 font-semibold">{member.inputPayload.birthPlace}</strong>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    #{member.orderNumber || member.id} • {reportLanguageName(member.language)}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    )}

                    {/* Middle: Complete Order & User Details (expanded only) */}
                    {expandedOrders[order.id] && !isFamily && (
                    <div id={`order-details-${order.id}`} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Left Column: User & Astrological Input Details */}
                      <div className="space-y-2 bg-slate-950/50 rounded-xl p-3.5 border border-slate-800/60">
                        <div className="text-[10.5px] uppercase font-bold text-amber-400 tracking-wider">
                          User & Birth Details
                        </div>
                        
                        {order.serviceType === 'MARRIAGE_COMPATIBILITY' && (boy || girl) ? (
                          <div className="space-y-2 text-xs">
                            <div className="text-slate-200">
                              <span className="font-bold text-blue-300">Groom:</span> {boy?.name || 'Groom'}{' '}
                              <span className="text-slate-400">({boy?.dob} • {boy?.tob} • {boy?.birthPlace})</span>
                            </div>
                            <div className="text-slate-200">
                              <span className="font-bold text-pink-300">Bride:</span> {girl?.name || 'Bride'}{' '}
                              <span className="text-slate-400">({girl?.dob} • {girl?.tob} • {girl?.birthPlace})</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5 text-xs">
                            {/* The name and gender live in the collapsed header now
                                (owner request, 2026-10-21); repeating them here would
                                say the same thing twice on one card. */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-300 text-[11.5px]">
                              {dob && (
                                <div>
                                  <span className="text-slate-400 font-medium">Date of Birth:</span>{' '}
                                  <strong className="text-amber-200 font-semibold">{dob}</strong>
                                </div>
                              )}
                              {tob && (
                                <div>
                                  <span className="text-slate-400 font-medium">Exact Time:</span>{' '}
                                  <strong className="text-amber-200 font-semibold">{tob}</strong>
                                </div>
                              )}
                              {birthPlace && (
                                <div className="sm:col-span-2">
                                  <span className="text-slate-400 font-medium">Birth Place:</span>{' '}
                                  <strong className="text-slate-200 font-semibold">{birthPlace}</strong>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Column: Financial & Booking Metadata */}
                      <div className="space-y-2 bg-slate-950/50 rounded-xl p-3.5 border border-slate-800/60 text-xs">
                        <div className="text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                          Order & Payment Information
                        </div>

                        <div className="space-y-1.5 text-[11.5px]">
                          <div className="flex justify-between text-slate-300">
                            <span className="text-slate-400">Ordered On:</span>
                            <strong className="text-slate-200">
                              {order.createdAt
                                ? new Date(order.createdAt).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  })
                                : 'N/A'}
                            </strong>
                          </div>

                          <div className="flex justify-between text-slate-300">
                            <span className="text-slate-400">Payment Mode:</span>
                            <strong className={isFree ? 'text-amber-400' : 'text-emerald-400'}>
                              {isFree ? '★ Free Beta (Your 1 Free Report)' : `Paid (${order.currency} $${order.amount})`}
                            </strong>
                          </div>

                          {order.paymentReference && (
                            <div className="flex justify-between text-slate-300">
                              <span className="text-slate-400">Payment Ref:</span>
                              <span className="font-mono text-[11px] text-slate-200">{order.paymentReference}</span>
                            </div>
                          )}

                          <div className="flex justify-between text-slate-300">
                            <span className="text-slate-400">Delivery Email:</span>
                            <strong className="text-amber-300">{order.userEmail}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Bottom Row: Delivery Status & Conditional Email Retry */}
                    <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-slate-800/80">
                      
                      {/* Delivery Status Message */}
                      <div className="flex-1 text-xs">
                        {bannerOrder.emailStatus === 'FAILED' ? (
                          <div className="text-rose-200 bg-rose-950/60 border border-rose-700/80 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-bold text-rose-300">
                                Email Delivery Failed / Bounced
                              </div>
                              <div className="text-[11.5px] text-rose-200">
                                We could not deliver your report to <strong>{bannerOrder.userEmail}</strong>. Please update your email address using the button on the right to receive your Vedic Report.
                              </div>
                            </div>
                          </div>
                        ) : bannerRefunded ? (
                          <div className="text-emerald-200 bg-emerald-950/50 border border-emerald-700/70 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                            <RotateCcw className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-bold text-emerald-300">
                                Refund Approved — {refundAmountText(order)}
                              </div>
                              <div className="text-[11.5px] text-emerald-200/90">
                                This order was cancelled before admin approval, so the 90% pre-approval refund applies (the remaining 10% covers the non-refundable payment gateway fee).
                                {order.refundDeadline && (
                                  <> The amount returns to your original payment method on or before <strong>{formatRefundDeadline(order.refundDeadline)}</strong> — within 3 working days.</>
                                )}
                                {order.refundMethod && order.refundMethod.toUpperCase() === 'GATEWAY' && order.refundReference && (
                                  <> It has already been sent back by the payment provider (reference <strong>{order.refundReference}</strong>).</>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : bannerCompleted ? (
                          <div className="text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-bold text-white">
                                Report Complete & Emailed
                              </div>
                              {/* Owner request (2026-10-21): one fact only — what
                                  was emailed, and where. The refund wording lives
                                  on the pending banner below and nowhere else: a
                                  completed order can no longer be refunded, so
                                  quoting the 90% pre-approval window here is
                                  something the customer cannot act on. */}
                              <div className="text-[11.5px] text-emerald-200">
                                Your Vedic Report and Tax Invoice PDFs were emailed to <strong>{bannerOrder.userEmail}</strong>.
                              </div>
                            </div>
                          </div>
                        ) : order.status === 'CANCELLED' ? (
                          <div className="text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl px-3.5 py-2 flex items-center gap-2 text-[11.5px]">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>This order was cancelled.</span>
                          </div>
                        ) : (
                          <div className="text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="font-bold text-amber-200">
                                Processing in Vedic Astrology Queue
                              </div>
                              <div className="text-[11.5px] text-amber-300/90">
                                Our India Vedic astrology scholars are reviewing your planetary chart. Your PDF Report and Tax Invoice will be emailed to <strong>{bannerOrder.userEmail}</strong>.
                              </div>
                              <div className="text-[11px] text-amber-300/80 pt-0.5">
                                Not approved yet — you are eligible for a <strong>90% refund</strong> if you cancel before admin approval (the other 10% is the non-refundable payment gateway fee). Approved refunds settle within <strong>3 working days</strong>. To request one, email <strong>admin@astrosivam.com</strong> with this order number.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Request Email Resend / Update Email Button: ONLY ENABLED IF DELIVERY FAILED OR PENDING */}
                      {(bannerOrder.emailStatus === 'FAILED' || bannerOrder.status === 'PENDING' || bannerOrder.status === 'PENDING_APPROVAL') && (
                        <div className="shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => handleOpenResendModal(bannerOrder)}
                            className={`w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 border ${
                              bannerOrder.emailStatus === 'FAILED'
                                ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-amber-500/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border-slate-700'
                            }`}
                            title={bannerOrder.emailStatus === 'FAILED' ? "Update email address and re-dispatch report" : "Update delivery email address"}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>{bannerOrder.emailStatus === 'FAILED' ? "Update Email & Retry Delivery" : "Update Delivery Email"}</span>
                          </button>
                        </div>
                      )}

                    </div>

                    {/* Frozen report download (delivered orders only): the file
                        is rendered from the snapshot prepared on the order
                        date and never recalculates. Report only — the tax
                        invoice stays email-only. */}
                    {/* One download block per DELIVERED member, so a family card
                        keeps every chart's download exactly as a single order
                        keeps its own. The block below is byte-for-byte the tested
                        one — `order` is merely re-bound per member. */}
                    {members.filter(m => memberDone(m) && m.hasPdf).map(downloadOrder => { const order = downloadOrder; return (
                      <div key={`download-${order.id}`} className="pt-1 space-y-2" data-frozen-download={order.id}>
                        {(order.items?.length || 0) > 0 ? (
                          <div className="space-y-2">
                            {(order.items || []).map(item => {
                              const itemReady = item.reportStatus === 'SENT' && item.hasReportSnapshot !== false;
                              const itemService = item.serviceCode === 'BIRTH_JATHAGAM'
                                ? 'Birth Jathagam'
                                : item.serviceCode === 'MARRIAGE_COMPATIBILITY'
                                  ? 'Wedding Matching'
                                  : item.serviceCode === 'BABY_NAMING'
                                    ? 'Baby Naming'
                                    : item.serviceCode === 'MUHURTHAM'
                                      ? 'Subha Muhurtham'
                                      : String(item.serviceCode).replace(/_/g, ' ');
                              // Owner request (2026-10-21): the row is a name and
                              // an icon. No wide button, no "Prepared on" line —
                              // the date and language added height to every card
                              // and told the customer nothing they act on. The
                              // label ternary stays in title/aria-label so the
                              // button is still named for a screen reader and
                              // still promises "Downloading…" while it works.
                              return (
                                <div key={item.id} className="flex items-center justify-between gap-2 bg-slate-950/50 border border-slate-800/60 rounded-xl px-3.5 py-2">
                                  <div className="min-w-0 text-[11.5px] text-slate-300">
                                    <span className="font-bold text-white">{item.personName || 'Report'}</span>
                                    <span className="text-slate-400"> — {itemService}</span>
                                    {downloadingKey === `${order.id}:${item.id}` && (
                                      <span className="block text-[11px] font-bold text-amber-300">Downloading…</span>
                                    )}
                                  </div>
                                  {itemReady ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadReport(order, item)}
                                      disabled={downloadingKey === `${order.id}:${item.id}`}
                                      title={downloadingKey === `${order.id}:${item.id}` ? 'Downloading…' : 'Download Report'}
                                      aria-label={downloadingKey === `${order.id}:${item.id}` ? 'Downloading…' : `Download Report — ${item.personName || 'report'}`}
                                      className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 disabled:opacity-60 transition-all cursor-pointer active:scale-95"
                                    >
                                      {downloadingKey === `${order.id}:${item.id}`
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Download className="h-4 w-4" />}
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-500">
                                      {item.reportStatus === 'SENT' ? 'Download unavailable for this report — please use the emailed copy.' : 'Available after delivery.'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : order.hasReportSnapshot === false ? (
                          <p className="text-[11px] text-slate-500">
                            Report download is unavailable for this order — please use the PDF copy emailed to you.
                          </p>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {downloadingKey === order.id && (
                              <span className="text-[11px] font-bold text-amber-300">Downloading…</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownloadReport(order)}
                              disabled={downloadingKey === order.id}
                              title={downloadingKey === order.id ? 'Downloading…' : 'Download Report'}
                              aria-label={downloadingKey === order.id ? 'Downloading…' : 'Download Report'}
                              className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 disabled:opacity-60 transition-all cursor-pointer active:scale-95"
                            >
                              {downloadingKey === order.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Download className="h-4 w-4" />}
                            </button>
                          </div>
                        )}
                        {downloadFeedback?.orderId === order.id && (
                          <div
                            role="status"
                            className={`p-3 rounded-xl border flex items-start gap-2 text-[11.5px] ${
                              downloadFeedback.type === 'success'
                                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                                : 'bg-rose-950/50 border-rose-800 text-rose-300'
                            }`}
                          >
                            {downloadFeedback.type === 'success'
                              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                            <span>{downloadFeedback.message}</span>
                          </div>
                        )}
                        {/* The rendered file, as a REAL link the customer taps.

                            A scripted anchor click only counts as a download
                            while the gesture that started it is still alive;
                            after a tens-of-seconds print capture it is not, and
                            iOS Safari then drops it without a word. This link is
                            the same bytes at the same print density — the tap is
                            a fresh gesture every browser honours. */}
                        {savedReport?.orderId === order.id && (
                          <div
                            data-saved-report={order.id}
                            className="p-3 rounded-xl border border-emerald-800/70 bg-emerald-950/40 space-y-2"
                          >
                            <p className="text-[11.5px] text-emerald-200 break-all">
                              <FileText className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                              {savedReport.fileName}
                            </p>
                            <a
                              href={savedReport.url}
                              download={savedReport.fileName}
                              rel="noopener"
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-95 transition-all"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Save the PDF</span>
                            </a>
                            <p className="text-[11px] text-emerald-300/70">
                              On iPhone and iPad this opens the report in Safari — tap the Share icon, then
                              “Save to Files”.
                            </p>
                          </div>
                        )}
                      </div>
                    ); })}

                    {/* Verified review — paid, delivered orders only (server-decided). */}
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
                    onChange={e => setFRelation(e.target.value as FamilyRelation)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  >
                    {FAMILY_RELATION_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="family-member-gender">
                    Gender:
                  </label>
                  <select
                    id="family-member-gender"
                    value={fGender}
                    onChange={e => setFGender(e.target.value as 'M' | 'F')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
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
                label="Birth Place (Google Maps)"
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
