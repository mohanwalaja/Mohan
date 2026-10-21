import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  Globe,
  AlertCircle,
  Eye,
  FileText,
  Check,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Mail,
  Loader2,
  Users,
  ShoppingBag,
  ShoppingCart
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { GooglePlacesPicker, LocationData } from '../components/common/GooglePlacesPicker';
import { BirthDateField, BirthTimeField, BirthTimeZoneNotice } from '../components/common/BirthDateTimeFields';
import { PersonNameField } from '../components/common/PersonNameField';
import { ServicePageHeader } from '../components/common/ServicePageHeader';
import { AuthModal } from '../components/common/AuthModal';
import { PaymentGatewayCheckoutBox } from '../components/cart/PaymentGatewayCheckoutBox';
import { SingleServiceCheckoutModal } from '../components/cart/SingleServiceCheckoutModal';
import { api } from '../services/api';
import {
  getServicePrices,
  getServicePriceInCurrency,
  getCurrencyForPaymentMethod,
  getCurrencySymbol
} from '../services/pricing';
import { MAX_FAMILY_ORDER_ITEMS, hasFamilyOrderCapacity } from '../services/familyOrderLimits';
import { AppLanguage } from '../types';
import { SEO } from '../components/common/SEO';
import { JsonLd } from '../components/common/JsonLd';
import { ServiceFaqSection } from '../components/common/ServiceFaqSection';
import { RelatedReports } from '../components/common/RelatedReports';
import { MARRIAGE_COMPATIBILITY_FAQ_ITEMS } from '../data/serviceFaqs';
import { buildBreadcrumbJsonLd } from '../services/structuredData';
import { RouteLink } from '../components/common/RouteLink';
import { SampleReportButton } from '../components/common/SampleReportButton';
import { resolveLocationTimezone } from '../lib/timezone';
import {
  FAMILY_RELATION_OPTIONS,
  isValidBirthTime,
  isValidIsoBirthDate,
  isVerifiedBirthLocation,
  locationFromSavedPerson,
  normalizeBirthDate,
  normalizeBirthTime,
  normalizePersonName,
  type SavedPerson
} from '../utils/birthDetails';
import { SavedPersonPicker, useSavedPeople, useDashboardOrderFor } from '../components/common/SavedPersonPicker';
import { SaveBirthDetailsOption } from '../components/common/SaveBirthDetailsOption';
import { saveBirthDetailsForNextTime } from '../services/saveBirthDetails';

interface MarriageCompatibilityPageProps {
  onNavigate: (route: string) => void;
}

export const MarriageCompatibilityPage: React.FC<MarriageCompatibilityPageProps> = ({ onNavigate }) => {
  const { user, settings, saveFamilyMember, updateBirthProfile } = useAuth();
  const { language: currentAppLang } = useLanguage();
  const {
    addItem,
    openCart,
    items: cartItems,
    paymentMethod,
    setPaymentMethod
  } = useCart();

  const isBeta = settings?.serviceMode === 'FREE_BETA';
  // FREE BETA RULE — 1 free report per customer (tracked per IP address).
  // The first order from this connection is free; after that every order is
  // a normal paid order (also true for family orders: only member 1 is free).
  const betaFreeChartAvailable = settings?.betaFreeChartAvailable !== false;
  const isAdmin = user?.role === 'admin';
  const orderWillBeFree = isAdmin || (isBeta && betaFreeChartAvailable);

  const mcPrices = getServicePrices(settings, 'MARRIAGE_COMPATIBILITY');
  const inrPrice = mcPrices.INR;
  const usdPrice = mcPrices.USD;

  // The customer's payment choice — never a birth place — decides the currency.
  const chargeCurrency = getCurrencyForPaymentMethod(paymentMethod);
  const chargeSymbol = getCurrencySymbol(chargeCurrency);
  const chargeAmount = getServicePriceInCurrency(settings, 'MARRIAGE_COMPATIBILITY', chargeCurrency);

  // Person 1 (Customer / Saved Profile)
  const [p1Role, setP1Role] = useState<'bride' | 'groom'>('groom');
  const [p1Name, setP1Name] = useState('');
  const [p1Dob, setP1Dob] = useState('');
  const [p1Tob, setP1Tob] = useState('');
  const [p1Location, setP1Location] = useState<LocationData | null>(null);
  const manuallyEditedPerson1 = useRef({ name: false, dob: false, tob: false, location: false, role: false });

  // Person 2 (Partner Details)
  const [p2Name, setP2Name] = useState('');
  const [p2Dob, setP2Dob] = useState('');
  const [p2Tob, setP2Tob] = useState('');
  const [p2Location, setP2Location] = useState<LocationData | null>(null);
  // Live time-zone preview for each partner (same resolver the payload uses).
  const p1TimezonePreview = p1Location
    ? resolveLocationTimezone(p1Dob, p1Tob, p1Location.latitude, p1Location.longitude, p1Location.timezoneOffsetHours, p1Location.timeZoneId)
    : null;
  const p2TimezonePreview = p2Location
    ? resolveLocationTimezone(p2Dob, p2Tob, p2Location.latitude, p2Location.longitude, p2Location.timezoneOffsetHours, p2Location.timeZoneId)
    : null;

  // Settings & Submission
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en');
  const [saveAsProfile, setSaveAsProfile] = useState(false);
  const [p1SaveRelation, setP1SaveRelation] = useState('OTHER');
  const [p2SaveRelation, setP2SaveRelation] = useState('SPOUSE');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [traySuccessMessage, setTraySuccessMessage] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const person1Label = p1Role === 'bride' ? 'Bride' : 'Groom';
  const person2Label = p1Role === 'bride' ? 'Groom' : 'Bride';

  const validatePersonBirthDetails = (
    fullName: string,
    dateOfBirth: string,
    timeOfBirth: string,
    place: LocationData | null,
    personLabel: string
  ): string => {
    if (!normalizePersonName(fullName)) return `Please enter the full name for the ${personLabel}.`;
    if (!dateOfBirth) return `Please enter the date of birth for the ${personLabel}.`;
    if (!isValidIsoBirthDate(dateOfBirth)) return `Please enter a valid, non-future date of birth for the ${personLabel}.`;
    if (!timeOfBirth) return `Please enter the birth time for the ${personLabel}.`;
    if (!isValidBirthTime(timeOfBirth)) return `Please enter a valid birth time for the ${personLabel}.`;
    if (!place?.placeName?.trim()) return `Please select the birth place for the ${personLabel}.`;
    if (!isVerifiedBirthLocation(place)) return `The ${personLabel.toLowerCase()}'s birth place is missing valid coordinates or timezone. Please select it again.`;
    return '';
  };

  const validateMarriageForm = (): string =>
    validatePersonBirthDetails(p1Name, p1Dob, p1Tob, p1Location, person1Label) ||
    validatePersonBirthDetails(p2Name, p2Dob, p2Tob, p2Location, person2Label);

  const handleAddToFamilyTray = () => {
    if (!hasFamilyOrderCapacity(cartItems.length)) {
      setErrorMessage(`Family Tray is limited to ${MAX_FAMILY_ORDER_ITEMS} reports. Remove a report before adding another.`);
      setTraySuccessMessage('');
      return;
    }
    const validationMessage = validateMarriageForm();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    let payloads;
    try {
      payloads = getBrideAndGroomPayloads();
    } catch (err: any) {
      setErrorMessage(err.message);
      return;
    }

    // Every chart is priced in all three currencies; the tray/checkout later
    // bills the whole family in the ONE currency the customer pays with.
    const prices = getServicePrices(settings, 'MARRIAGE_COMPATIBILITY');
    // Free Beta: the checkout prices the FIRST chart of the order free.
    const unitPrice = prices[chargeCurrency];

    const pairTitle = `${normalizePersonName(p1Name)} & ${normalizePersonName(p2Name)}`;

    const addedItemId = addItem({
      serviceType: 'MARRIAGE_COMPATIBILITY',
      language: selectedLanguage,
      devoteeName: pairTitle,
      summaryText: `Matching: ${payloads.bride.name} (${payloads.bride.dob}) + ${payloads.groom.name} (${payloads.groom.dob})`,
      country: p1Location.country || '',
      inputPayload: payloads,
      prices,
      unitPrice,
      currency: chargeCurrency
    });
    if (!addedItemId) {
      setErrorMessage(`Family Tray is limited to ${MAX_FAMILY_ORDER_ITEMS} reports. Remove a report before adding another.`);
      setTraySuccessMessage('');
      return;
    }

    persistMarriageBirthDetails();
    setSaveAsProfile(false);

    const reachedFamilyLimit = cartItems.length + 1 >= MAX_FAMILY_ORDER_ITEMS;
    setTraySuccessMessage(reachedFamilyLimit
      ? `Matching for "${pairTitle}" added to Cart! Maximum ${MAX_FAMILY_ORDER_ITEMS} orders reached. You can checkout & pay now, and place your next order after payment.`
      : `Matching for "${pairTitle}" added to Cart (${cartItems.length + 1}/${MAX_FAMILY_ORDER_ITEMS} orders)! You can add another service or checkout anytime.`);
    setErrorMessage('');
    
    // Reset Person 2 for next match
    setP2Name('');
    setP2Dob('');
    setP2Tob('');
    setP2Location(null);
    setP2PickedKey('');

    openCart();
  };

  // Saved-person pickers: BOTH people start blank. The signed-in user's own
  // details are never auto-filled into Person 1 — a saved profile or family
  // member fills a card only when the customer explicitly picks them.
  const [p1PickedKey, setP1PickedKey] = useState('');
  const [p2PickedKey, setP2PickedKey] = useState('');
  const savedPeople = useSavedPeople();
  const pickedPerson1 = savedPeople.find(person => person.key === p1PickedKey) || null;
  const pickedPerson2 = savedPeople.find(person => person.key === p2PickedKey) || null;

  const handlePickPerson1 = (person: SavedPerson | null, key: string) => {
    setSaveAsProfile(false);
    setP1PickedKey(key);
    if (person) {
      setP1Name(person.name);
      setP1Dob(normalizeBirthDate(person.dob));
      setP1Tob(normalizeBirthTime(person.tob));
      setP1Role(person.gender === 'F' ? 'bride' : 'groom');
      setP1Location(locationFromSavedPerson(person));
    } else {
      setP1Name('');
      setP1Dob('');
      setP1Tob('');
      setP1Location(null);
    }
  };

  const handlePickPerson2 = (person: SavedPerson | null, key: string) => {
    setSaveAsProfile(false);
    setP2PickedKey(key);
    if (person) {
      setP2Name(person.name);
      setP2Dob(normalizeBirthDate(person.dob));
      setP2Tob(normalizeBirthTime(person.tob));
      setP2Location(locationFromSavedPerson(person));
    } else {
      setP2Name('');
      setP2Dob('');
      setP2Tob('');
      setP2Location(null);
    }
  };
  useDashboardOrderFor(savedPeople, person => handlePickPerson1(person, person.key));

  const getBrideAndGroomPayloads = () => {
    const p1Place = p1Location?.placeName || '';
    const p2Place = p2Location?.placeName || '';
    const p1Lat = typeof p1Location?.latitude === 'number' && Number.isFinite(p1Location.latitude) ? p1Location.latitude : 0;
    const p1Lng = typeof p1Location?.longitude === 'number' && Number.isFinite(p1Location.longitude) ? p1Location.longitude : 0;
    const p2Lat = typeof p2Location?.latitude === 'number' && Number.isFinite(p2Location.latitude) ? p2Location.latitude : 0;
    const p2Lng = typeof p2Location?.longitude === 'number' && Number.isFinite(p2Location.longitude) ? p2Location.longitude : 0;

    const p1Timezone = resolveLocationTimezone(
      p1Dob, p1Tob, p1Lat, p1Lng,
      p1Location?.timezoneOffsetHours, p1Location?.timeZoneId
    );
    const p2Timezone = resolveLocationTimezone(
      p2Dob, p2Tob, p2Lat, p2Lng,
      p2Location?.timezoneOffsetHours, p2Location?.timeZoneId
    );
    const bridePayload = p1Role === 'bride'
      ? {
          name: normalizePersonName(p1Name), dob: p1Dob, tob: p1Tob,
          birthPlace: p1Place, country: p1Location?.country || '',
          latitude: p1Lat, longitude: p1Lng,
          timezoneOffsetHours: p1Timezone.timezoneOffsetHours, timeZoneId: p1Timezone.timeZoneId,
          gender: 'F'
        }
      : {
          name: normalizePersonName(p2Name), dob: p2Dob, tob: p2Tob,
          birthPlace: p2Place, country: p2Location?.country || '',
          latitude: p2Lat, longitude: p2Lng,
          timezoneOffsetHours: p2Timezone.timezoneOffsetHours, timeZoneId: p2Timezone.timeZoneId,
          gender: 'F'
        };

    const groomPayload = p1Role === 'groom'
      ? {
          name: normalizePersonName(p1Name), dob: p1Dob, tob: p1Tob,
          birthPlace: p1Place, country: p1Location?.country || '',
          latitude: p1Lat, longitude: p1Lng,
          timezoneOffsetHours: p1Timezone.timezoneOffsetHours, timeZoneId: p1Timezone.timeZoneId,
          gender: 'M'
        }
      : {
          name: normalizePersonName(p2Name), dob: p2Dob, tob: p2Tob,
          birthPlace: p2Place, country: p2Location?.country || '',
          latitude: p2Lat, longitude: p2Lng,
          timezoneOffsetHours: p2Timezone.timezoneOffsetHours, timeZoneId: p2Timezone.timeZoneId,
          gender: 'M'
        };

    return {
      bride: bridePayload,
      groom: groomPayload,
      brideName: bridePayload.name,
      brideDob: bridePayload.dob,
      brideTob: bridePayload.tob,
      brideBirthPlace: bridePayload.birthPlace,
      brideCountry: bridePayload.country,
      brideLatitude: bridePayload.latitude,
      brideLongitude: bridePayload.longitude,
      brideTimezoneOffsetHours: bridePayload.timezoneOffsetHours,
      brideTimeZoneId: bridePayload.timeZoneId,
      groomName: groomPayload.name,
      groomDob: groomPayload.dob,
      groomTob: groomPayload.tob,
      groomBirthPlace: groomPayload.birthPlace,
      groomCountry: groomPayload.country,
      groomLatitude: groomPayload.latitude,
      groomLongitude: groomPayload.longitude,
      groomTimezoneOffsetHours: groomPayload.timezoneOffsetHours,
      groomTimeZoneId: groomPayload.timeZoneId,
      country: p1Location?.country || p2Location?.country || ''
    };
  };

  const persistMarriageBirthDetails = (includeSelf = true) => {
    if (!saveAsProfile || !user) return;

    let savedSelf = false;
    const savePerson = (
      selectedPerson: SavedPerson | null,
      relation: string,
      fullName: string,
      dateOfBirth: string,
      timeOfBirth: string,
      location: LocationData | null,
      timezoneOffsetHours: number | undefined,
      gender: 'M' | 'F'
    ) => {
      if (!location || (selectedPerson?.source === 'self' && (!includeSelf || savedSelf))) return;
      if (selectedPerson?.source === 'self') savedSelf = true;
      void saveBirthDetailsForNextTime({
        saveFamilyMember,
        updateBirthProfile,
        selectedPerson,
        relation: relation as any,
        name: fullName,
        dob: dateOfBirth,
        tob: timeOfBirth,
        location,
        timezoneOffsetHours,
        gender: selectedPerson?.gender || gender
      });
    };

    savePerson(
      pickedPerson1,
      p1SaveRelation,
      p1Name,
      p1Dob,
      p1Tob,
      p1Location,
      p1TimezonePreview?.timezoneOffsetHours,
      p1Role === 'bride' ? 'F' : 'M'
    );
    savePerson(
      pickedPerson2,
      p2SaveRelation,
      p2Name,
      p2Dob,
      p2Tob,
      p2Location,
      p2TimezonePreview?.timezoneOffsetHours,
      p1Role === 'bride' ? 'M' : 'F'
    );
  };

  const executeOrderSubmission = async () => {
    const validationMessage = validateMarriageForm();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    if (!orderWillBeFree && paymentMethod !== 'NONE' && !paymentRef) {
      setErrorMessage('Please enter the payment transaction reference / receipt number.');
      return;
    }

    let payloads;
    try {
      payloads = getBrideAndGroomPayloads();
    } catch (err: any) {
      setErrorMessage(err.message);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.placeOrder({
        serviceType: 'MARRIAGE_COMPATIBILITY',
        language: selectedLanguage,
        country: user?.country || '',
        // FREE BETA: only the FIRST report of this connection is free —
        // a used free chart makes this a normal paid order.
        paymentMethod: orderWillBeFree ? 'NONE' : paymentMethod,
        billingCountry: user?.country || '',
        currency: chargeCurrency,
        paymentReference: orderWillBeFree ? undefined : paymentRef,
        paymentIntentId: orderWillBeFree ? undefined : paymentIntentId || undefined,
        inputPayload: payloads,
        saveAsProfile: saveAsProfile && (pickedPerson1?.source === 'self' || pickedPerson2?.source === 'self')
      });

      if (res.success && res.order) {
        persistMarriageBirthDetails(false);
        setOrderSuccess(res.order);
      } else {
        setErrorMessage(res.message || 'Failed to submit order');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to submit order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const validationMessage = validateMarriageForm();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setShowCheckoutModal(true);
  };

  return (
    <div className="service-page">
      <SEO
        title="10 Porutham Online: Marriage Compatibility (Kundali Matching) | ASTRO SIVAM"
        description="Check Thirumana Porutham (10 Porutham) marriage compatibility online — all 10 poruthams, Kuja Dosha analysis, dosha balance and a certified priest verdict in English, Tamil or Hindi."
        canonical="https://astrosivam.com/marriage-compatibility"
      />
      {/* Breadcrumb for crawlers (index-coverage audit 2026-10-16): Home → Services → this page. */}
      <JsonLd
        id="breadcrumb"
        data={buildBreadcrumbJsonLd([
          { name: 'Home', url: 'https://astrosivam.com/' },
          { name: 'Services', url: 'https://astrosivam.com/services' },
          { name: '10 Porutham Marriage Compatibility', url: 'https://astrosivam.com/marriage-compatibility' }
        ])}
      />

      <ServicePageHeader
        icon={Heart}
        eyebrow="10 Poruthams · Kuja Dosha · Vedic Matrimonial Compatibility"
        title="Vedic Marriage Compatibility & Matrimonial Horoscope Match"
        description="Detailed 10-Porutham evaluation including Dina, Gana, Mahendra, Stree Dheerkha, Yoni, Rasi, Rasiyathipathi, Vasiya, Rajju, and Vedha. Features in-depth Kuja (Mars) Dosha analysis and Dosha Samyam balance."
        showChatBenefit
      />

      {/* Main Grid: Form + Real-time Compatibility Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-7 service-form-card p-5 sm:p-7">
          {orderSuccess ? (
            <div className="space-y-6 py-6 text-center animate-fade-in">
              <div className="w-16 h-16 bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 rounded-2xl flex items-center justify-center mx-auto shadow-md">
                <Heart className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Matchmaking Order Placed!
                </h3>
                <p className="text-xs font-mono font-bold text-pink-600 dark:text-pink-400">
                  Order ID: {orderSuccess.orderNumber}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  {isAdmin
                    ? 'Your free admin Marriage Compatibility order is queued. Our India priest team prepares reports daily (9:00 AM – 11:00 AM IST), and your official PDF report and Tax Invoice will be emailed to ' + orderSuccess.userEmail + ' upon approval.'
                    : orderSuccess.serviceMode === 'FREE_BETA'
                    ? 'Your Marriage Compatibility report order is in the FREE BETA queue. Our priest team prepares charts daily between 9:00 AM – 11:00 AM IST. Once approved by the administrator, your verified PDF report and Tax Invoice will be emailed to ' + orderSuccess.userEmail + '.'
                    : 'Your paid order is received. Our India-based priest team prepares reports daily between 9:00 AM – 11:00 AM IST. Following administrator review and approval, your complete PDF report and Tax Invoice will be emailed directly to ' + orderSuccess.userEmail + '.'}
                </p>

                {/* Spam Folder Advisory Box */}
                <div className="p-3.5 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-300 dark:border-pink-700/60 text-left text-xs text-pink-900 dark:text-pink-200 max-w-md mx-auto flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-pink-600 dark:text-pink-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-pink-950 dark:text-pink-100">⚠️ Email Delivery Notice:</strong> Once the admin approves your report, your official PDF report & Tax Invoice will be sent from <code>admin@astrosivam.com</code>. <strong>Please check your Spam / Junk folder</strong> in addition to your Inbox, and click &ldquo;Not Spam&rdquo; to ensure future reports land safely in your inbox.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <RouteLink
                  route="dashboard"
                  onNavigate={onNavigate}
                  className="px-5 py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                >
                  View in Customer Dashboard
                </RouteLink>
                <button
                  onClick={() => {
                    setOrderSuccess(null);
                  }}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Match Another Couple
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitOrder} className="space-y-6">
              
              {/* Guest / Non-logged in quick sign-in banner */}
              {!user && (
                <div className="p-4 bg-gradient-to-r from-pink-500/10 via-pink-500/5 to-transparent border border-pink-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-pink-500 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        Sign in to Use Saved Birth Details
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Sign in with Google to pick saved profiles or family members for either person and track match orders.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="px-3.5 py-2.5 min-h-[44px] bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all whitespace-nowrap cursor-pointer"
                  >
                    Quick Sign In
                  </button>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* PERSON 1: blank by default — pick a saved person explicitly. */}
              <div className="service-form-section space-y-4 p-5 sm:p-6">
                <SavedPersonPicker
                  value={p1PickedKey}
                  onPick={handlePickPerson1}
                  label="Use saved birth details for Person 1"
                />
                <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-slate-100 uppercase tracking-wider">
                    <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 text-xs font-black flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">1</span>
                    <span>Person 1 ({p1Role === 'groom' ? 'Groom' : 'Bride'})</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-slate-800 rounded-2xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        manuallyEditedPerson1.current.role = true;
                        setP1Role('groom');
                      }}
                      className={`px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        p1Role === 'groom'
                          ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-sm font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👨 Groom
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        manuallyEditedPerson1.current.role = true;
                        setP1Role('bride');
                      }}
                      className={`px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        p1Role === 'bride'
                          ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-sm font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👩 Bride
                    </button>
                  </div>
                </div>

                <PersonNameField
                  id="marriage-person-1-name"
                  label={`${person1Label} full name`}
                  value={p1Name}
                  onChange={value => {
                    manuallyEditedPerson1.current.name = true;
                    setP1Name(value);
                  }}
                  placeholder={`e.g. ${person1Label} full name`}
                  size="sm"
                  theme="dark"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <BirthDateField
                    label="Date of Birth"
                    size="sm"
                    theme="dark"
                    value={p1Dob}
                    onChange={value => {
                      manuallyEditedPerson1.current.dob = true;
                      setP1Dob(value);
                    }}
                  />
                  <BirthTimeField
                    label="Birth Time"
                    size="sm"
                    theme="dark"
                    value={p1Tob}
                    onChange={value => {
                      manuallyEditedPerson1.current.tob = true;
                      setP1Tob(value);
                    }}
                  />
                </div>

                <GooglePlacesPicker
                  value={p1Location || undefined}
                  onChange={selectedLocation => {
                    manuallyEditedPerson1.current.location = true;
                    setP1Location(selectedLocation);
                  }}
                  label={`${p1Role === 'bride' ? "Bride's" : "Groom's"} Birth Place (Google Maps)`}
                  required
                />
                <BirthTimeZoneNotice resolution={p1TimezonePreview} date={p1Dob} time={p1Tob} theme="dark" />
              </div>

              {/* PERSON 2: Partner Birth Particulars (also pickable). */}
              <div className="service-form-section space-y-4 p-5 sm:p-6">
                <SavedPersonPicker
                  value={p2PickedKey}
                  onPick={handlePickPerson2}
                  label="Use saved birth details for Person 2"
                />
                <div className="flex items-center justify-between border-b border-pink-500/25 pb-3">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-pink-200 uppercase tracking-wider">
                    <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-md shadow-pink-500/20">2</span>
                    <Heart className="w-4 h-4 text-pink-400" />
                    <span>Person 2 ({p1Role === 'groom' ? 'Bride Details' : 'Groom Details'})</span>
                  </div>
                </div>

                <PersonNameField
                  id="marriage-person-2-name"
                  label={`${person2Label} full name`}
                  value={p2Name}
                  onChange={setP2Name}
                  placeholder={`e.g. ${person2Label} full name`}
                  size="sm"
                  theme="dark"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <BirthDateField
                    label="Date of Birth"
                    size="sm"
                    theme="dark"
                    value={p2Dob}
                    onChange={setP2Dob}
                  />
                  <BirthTimeField
                    label="Birth Time"
                    size="sm"
                    theme="dark"
                    value={p2Tob}
                    onChange={setP2Tob}
                  />
                </div>

                <GooglePlacesPicker
                  value={p2Location || undefined}
                  onChange={setP2Location}
                  label={`${p1Role === 'bride' ? "Groom's" : "Bride's"} Birth Place (Google Maps)`}
                  required
                />
                <BirthTimeZoneNotice resolution={p2TimezonePreview} date={p2Dob} time={p2Tob} theme="dark" />
              </div>

              {/* 3. Language Selection: English, Tamil, Hindi */}
              <div className="service-form-section space-y-3 p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 text-xs font-black flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">3</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                      Select Report Language <span className="text-rose-400">*</span>
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">English · Tamil · Hindi</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage('en')}
                    className={`py-3.5 px-2 rounded-2xl border text-center transition-all cursor-pointer shadow-xs ${
                      selectedLanguage === 'en'
                        ? 'bg-pink-500/15 border-pink-500 text-pink-200 font-black ring-2 ring-pink-500/40 shadow-md'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xs font-bold block">English</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedLanguage('ta')}
                    className={`py-3.5 px-2 rounded-2xl border text-center transition-all cursor-pointer shadow-xs ${
                      selectedLanguage === 'ta'
                        ? 'bg-pink-500/15 border-pink-500 text-pink-200 font-black ring-2 ring-pink-500/40 shadow-md'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xs font-bold block">Tamil (தமிழ்)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedLanguage('hi')}
                    className={`py-3.5 px-2 rounded-2xl border text-center transition-all cursor-pointer shadow-xs ${
                      selectedLanguage === 'hi'
                        ? 'bg-pink-500/15 border-pink-500 text-pink-200 font-black ring-2 ring-pink-500/40 shadow-md'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xs font-bold block">Hindi (हिन्दी)</span>
                  </button>
                </div>
              </div>

              {/* 4. Streamlined Checkout Action Section */}
              <div className="space-y-4 pt-4 border-t border-white/10">
                {user && (
                  <SaveBirthDetailsOption
                    id="marriage-save-details"
                    checked={saveAsProfile}
                    onChange={setSaveAsProfile}
                    label="Save both people's birth details for next time"
                    helperText="Optional. Selected profiles are updated; new details are added to Family Members."
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {!pickedPerson1 && (
                        <select
                          value={p1SaveRelation}
                          onChange={event => setP1SaveRelation(event.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 cursor-pointer"
                          aria-label="Relationship for Person 1"
                        >
                          {FAMILY_RELATION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              Person 1: {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {!pickedPerson2 && (
                        <select
                          value={p2SaveRelation}
                          onChange={event => setP2SaveRelation(event.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 cursor-pointer"
                          aria-label="Relationship for Person 2"
                        >
                          {FAMILY_RELATION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              Person 2: {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </SaveBirthDetailsOption>
                )}

                {/* Tray Success Message Banner */}
                {traySuccessMessage && (
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{traySuccessMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={openCart}
                      className="px-3 py-2.5 min-h-[44px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-lg shrink-0 transition-all cursor-pointer"
                    >
                      View Cart ({cartItems.length})
                    </button>
                  </div>
                )}

                {/* Primary Action Buttons: Add to Cart & Proceed to Checkout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {hasFamilyOrderCapacity(cartItems.length) ? (
                    <button
                      type="button"
                      onClick={handleAddToFamilyTray}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-amber-950/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                    >
                      <ShoppingCart className="w-4 h-4 text-slate-950" />
                      <span>Add to Cart</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCart}
                      className="w-full py-3.5 px-4 bg-amber-500/10 text-amber-300 font-bold text-xs rounded-2xl border border-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Cart Full — View Cart</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-400 hover:to-rose-400 text-white font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-pink-950/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  >
                    <Heart className="w-4 h-4 text-white" />
                    <span>Proceed to Checkout</span>
                  </button>
                </div>

                {/* Information Footer */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  <span>Up to {MAX_FAMILY_ORDER_ITEMS} orders in cart • Place next order after payment</span>
                  <div className="flex items-center gap-1 text-pink-600 dark:text-pink-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>10-Porutham Certified</span>
                  </div>
                </div>
              </div>

            </form>
          )}
        </div>

        {/* Right Column: 10 Poruthams Evaluation & Service Overview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-500" />
              <span>The 10 Classical Poruthams Evaluated</span>
            </h3>

            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Dina Porutham:</strong> Longevity, health, vitality, and prosperity for the couple.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Gana Porutham:</strong> Temperament, emotional resonance, and compatibility of natures (Deva, Manushya, Rakshasa).</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Mahendra Porutham:</strong> Children, lineage continuity, and marital happiness.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Stree Dheerkha:</strong> Financial security, longevity, and auspicious well-being of the bride.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Yoni Porutham:</strong> Physical intimacy and mutual biological harmony.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Rasi & Rasiyathipathi:</strong> Mental affinity, friendship, and harmonious relationship between planetary rulers.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Rajju & Vedha (Crucial):</strong> Marital bond longevity, auspicious tying of the knot, and freedom from afflictions.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-pink-500 shrink-0 mt-0.5" />
                <span><strong>Kuja / Sevvay Dosham (Manglik):</strong> Complete Mars placement balance analysis and traditional remedies.</span>
              </li>
            </ul>
          </div>

          {/* Public Sample Report — see the exact PDF before ordering */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-pink-300/70 dark:border-pink-800/50 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              <Eye className="w-4 h-4 text-pink-500" />
              <span>See the report before you order</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Open a complete sample Marriage Compatibility PDF — the 10 Porutham verdicts, Rajju &amp; Vedha checks and Kuja Dosha analysis exactly as delivered, with a light SAMPLE watermark. The sample uses fixed example details (Groom 01 Jan 2000, 2:00 AM, Chennai · Bride 15 Jun 1998, 6:30 AM, Chennai) and no customer data is ever used.
            </p>
            <SampleReportButton
              serviceType="MARRIAGE_COMPATIBILITY"
              language={selectedLanguage}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-500/60 bg-pink-500/10 px-4 py-3 text-xs font-bold text-pink-700 dark:text-pink-300 transition hover:bg-pink-500/20 disabled:opacity-60 cursor-pointer"
            />
          </div>

          {/* Verification Badge Box */}
          <div className="p-4 bg-pink-500/10 border border-pink-500/20 rounded-2xl space-y-2 text-xs">
            <div className="font-bold text-pink-900 dark:text-pink-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-pink-500" />
              <span>ASTRO SIVAM Priest Team Porutham Assessment & Privacy</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
              Every matrimonial match is meticulously analyzed by our venerable Vedic Priest and Astrologer team. All 10 Poruthams, Rajju alignments, and Kuja Dosha balances are thoroughly evaluated before your certified compatibility PDF report and Tax Invoice are delivered directly to your registered email (with live order history tracked in your Customer Dashboard).
            </p>
          </div>
        </div>

      </div>

      {/* Cross-links to the other reports — keyword-anchored internal links (index-coverage audit 2026-10-16). */}
      <RelatedReports
        onNavigate={onNavigate}
        links={[
          { route: 'birth-jathagam', label: 'Birth Jathagam (Janma Kundali) for each partner' },
          { route: 'muhurtham', label: 'Subha Muhurtham for the wedding date' },
          { route: 'baby-naming', label: 'Baby naming by nakshatra (Namakaran)' }
        ]}
      />

      {/* Service FAQ — visible answers + this page's FAQPage JSON-LD (index-coverage audit 2026-10-16). */}
      <ServiceFaqSection
        items={MARRIAGE_COMPATIBILITY_FAQ_ITEMS}
        canonicalUrl="https://astrosivam.com/marriage-compatibility"
        heading="10 Porutham marriage matching — questions, answered"
        intro="What the 10 Poruthams check, what you need, and how the compatibility report reaches you."
      />

      {/* Instant User Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={() => {
          setShowAuthModal(false);
          setShowCheckoutModal(true);
        }}
        title="Sign In to Place Matrimonial Matching Order"
        description="Sign in with Google or your email to generate your 10 Porutham & Kuja Dosha report PDF and track your order status."
      />

      {/* Dedicated Modern Checkout Modal */}
      <SingleServiceCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        serviceType="MARRIAGE_COMPATIBILITY"
        serviceTitle="10-Poruthams Marriage Compatibility"
        devoteeSummary={{
          name: p1Role === 'bride' ? `${p1Name} (Bride)` : `${p1Name} (Groom)`,
          dob: p1Dob,
          tob: p1Tob,
          birthPlace: p1Location?.placeName,
          secondaryName: p1Role === 'bride' ? `${p2Name} (Groom)` : `${p2Name} (Bride)`,
          secondaryDob: p2Dob,
          secondaryBirthPlace: p2Location?.placeName
        }}
        selectedLanguage={selectedLanguage}
        onLanguageChange={setSelectedLanguage}
        inputPayload={getBrideAndGroomPayloads()}
        saveAsProfile={saveAsProfile && (pickedPerson1?.source === 'self' || pickedPerson2?.source === 'self')}
        onSuccess={ord => {
          persistMarriageBirthDetails(false);
          setOrderSuccess(ord);
          setShowCheckoutModal(false);
        }}
        onNavigate={onNavigate}
      />

    </div>
  );
};
