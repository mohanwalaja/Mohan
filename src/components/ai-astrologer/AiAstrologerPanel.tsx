/**
 * ASTRO SIVAM source-based astrologer — the customer/admin chat panel.
 *
 * GUIDED MODE: customers never type a question. They pick a topic (the eight
 * page-2 life cards, doshas, remedies, order facts, or complaint/help) and
 * then one curated option, which the server answers from the customer's own
 * chart and local rules. The only free text a customer can send is a short
 * detail line on complaint options, which goes to the human team.
 * Administrators keep a test input so they can evaluate the reply path.
 *
 * Part 4 scope: the entry point, customer paid-gate handling and the history.
 * The typing choreography (status text for 2-4s, then three dots, then
 * 2-4 bubbles 1-2s apart, capped at 12s) is tuned in Part 5; the hooks it needs
 * are already here as TIMING constants so the tuning is a numbers change, not a
 * rewrite.
 *
 * Replies come only from ASTRO SIVAM's local chart calculations and curated
 * source-based knowledge base; the panel never claims to be a person.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, ChevronLeft, RefreshCw, Send, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import {
  aiAstrologer,
  AiAstrologerError,
  type AttachableOrder,
  type ChatLanguage,
  type ChatMessage,
  type ChatPerson,
  type GuidedCategory,
  type GuidedQuestion,
} from '../../services/aiAstrologerApi';
import guidedQuestionsData from '../../../knowledge/ai-astrologer/rules/guided-questions.json';

function buildLocalGuidedMenu(
  language: ChatLanguage,
  allowedServices: string[] = [],
  isAdmin = false,
): GuidedCategory[] {
  const lang: ChatLanguage = language === 'ta' || language === 'hi' ? language : 'en';
  const allowed = new Set(allowedServices.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const menu: GuidedCategory[] = [];
  for (const category of (guidedQuestionsData as any).categories ?? []) {
    const needs: string[] = Array.isArray(category.services)
      ? category.services.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];
    if (needs.length > 0 && !isAdmin && !needs.some((s) => allowed.has(s))) {
      continue;
    }
    menu.push({
      id: String(category.id ?? ''),
      icon: String(category.icon ?? ''),
      title: String(category.title?.[lang] ?? category.title?.en ?? ''),
      hint: String(category.hint?.[lang] ?? category.hint?.en ?? ''),
      questions: ((category.questions as any[]) ?? []).map((q) => ({
        id: String(q.id ?? ''),
        kind: (q.kind ?? 'area') as GuidedQuestion['kind'],
        text: String(q.text?.[lang] ?? q.text?.en ?? ''),
        needsDetails: Boolean(q.needsDetails),
      })),
    });
  }
  return menu;
}

/**
 * Timing, in milliseconds. The 12s cap is absolute; local rule matching and
 * chart calculation usually finish well before it.
 */
const TIMING = {
  statusMin: 2000,
  statusMax: 4000,
  bubbleGap: 1500,
  hardCap: 12000,
};

const DISCLAIMER: Record<ChatLanguage, string> = {
  en: 'Astrological guidance based on Vedic and Tamil traditions; not a substitute for medical, legal or financial advice.',
  ta: 'வேத மற்றும் தமிழ் மரபுகளின் அடிப்படையிலான ஜோதிட வழிகாட்டல்; மருத்துவ, சட்ட அல்லது நிதி ஆலோசனைக்கு மாற்று அல்ல.',
  hi: 'वैदिक और तमिल परंपराओं पर आधारित ज्योतिष मार्गदर्शन; चिकित्सा, कानूनी या वित्तीय सलाह का विकल्प नहीं।',
};

const STATUS: Record<ChatLanguage, string> = {
  en: 'ASTRO SIVAM Astrologer is checking your chart...',
  ta: 'ASTRO SIVAM ஜோதிடர் உங்கள் ஜாதகத்தைப் பார்க்கிறார்...',
  hi: 'ASTRO SIVAM ज्योतिषी आपकी कुंडली देख रहे हैं...',
};

const GREETING: Record<ChatLanguage, (name: string) => string> = {
  en: (n) => `Hello ${n} — welcome to ASTRO SIVAM. Pick a topic below and I will answer from your chart using our own astrology rules and references.`,
  ta: (n) => `வணக்கம் ${n} — ASTRO SIVAM-க்கு வரவேற்கிறோம். கீழே ஒரு தலைப்பை தேர்வு செய்யுங்கள்; உங்கள் ஜாதகத்தை வைத்து எங்கள் சொந்த ஜோதிட விதிகளால் பதிலளிக்கிறேன்.`,
  hi: (n) => `नमस्ते ${n} — ASTRO SIVAM में आपका स्वागत है। नीचे कोई विषय चुनें; मैं आपकी कुंडली से हमारे अपने ज्योतिष नियमों द्वारा उत्तर दूँगा।`,
};

/** Display names for the report the customer just received, per language. */
const SERVICE_TITLE: Record<string, Record<ChatLanguage, string>> = {
  BIRTH_JATHAGAM: { en: 'Birth Jathagam', ta: 'ஜன்ம ஜாதக', hi: 'जन्म कुंडली' },
  MARRIAGE_COMPATIBILITY: { en: 'Marriage Compatibility', ta: 'திருமண பொருத்த', hi: 'विवाह मिलान' },
  BABY_NAMING: { en: 'Baby Naming', ta: 'குழந்தை பெயர்', hi: 'नामकरण' },
  MUHURTHAM: { en: 'Muhurtham', ta: 'முகூர்த்த', hi: 'मुहूर्त' },
};

/**
 * Welcome for a customer whose report was just delivered. Names the report and
 * its order number, and opens the guided topic list.
 */
const ORDER_GREETING: Record<ChatLanguage, (name: string, service: string, orderNo: string) => string> = {
  en: (n, s, o) => `Hello ${n} — your ${s} report (#${o}) has been delivered. Pick a topic below and I will answer from your chart using our own astrology rules and references.`,
  ta: (n, s, o) => `வணக்கம் ${n} — உங்கள் ${s} அறிக்கை (#${o}) அனுப்பப்பட்டுள்ளது. கீழே ஒரு தலைப்பை தேர்வு செய்யுங்கள்; உங்கள் ஜாதகத்தை வைத்து எங்கள் சொந்த ஜோதிட விதிகளால் பதிலளிக்கிறேன்.`,
  hi: (n, s, o) => `नमस्ते ${n} — आपकी ${s} रिपोर्ट (#${o}) भेज दी गई है। नीचे कोई विषय चुनें; मैं आपकी कुंडली से हमारे अपने ज्योतिष नियमों द्वारा उत्तर दूँगा।`,
};

const RETRY_TEXT: Record<ChatLanguage, string> = {
  en: 'Please give me a moment, I am checking again.',
  ta: 'ஒரு கணம் பொறுங்கள், மீண்டும் பார்க்கிறேன்.',
  hi: 'एक क्षण रुकिए, मैं फिर से देख रहा हूँ।',
};

const HANDOFF_LABEL: Record<ChatLanguage, string> = {
  en: 'Talk to our astrologer',
  ta: 'எங்கள் ஜோதிடரிடம் பேசுங்கள்',
  hi: 'हमारे ज्योतिषी से बात करें',
};

const MENU_TITLE: Record<ChatLanguage, string> = {
  en: 'Choose a topic',
  ta: 'ஒரு தலைப்பை தேர்வு செய்யவும்',
  hi: 'एक विषय चुनें',
};

const ALL_TOPICS: Record<ChatLanguage, string> = {
  en: 'All topics',
  ta: 'அனைத்து தலைப்புகள்',
  hi: 'सभी विषय',
};

const DETAILS_PLACEHOLDER: Record<ChatLanguage, string> = {
  en: 'Add a short detail for our team (optional)...',
  ta: 'எங்கள் குழுவுக்கு சிறு விவரம் சேர்க்கவும் (விருப்பம்)...',
  hi: 'हमारी टीम के लिए संक्षिप्त विवरण जोड़ें (वैकल्पिक)...',
};

const DETAILS_SEND: Record<ChatLanguage, string> = {
  en: 'Send to our team',
  ta: 'குழுவுக்கு அனுப்பவும்',
  hi: 'टीम को भेजें',
};

const CANCEL_TEXT: Record<ChatLanguage, string> = {
  en: 'Cancel',
  ta: 'ரத்து',
  hi: 'रद्द करें',
};

const MENU_LOADING: Record<ChatLanguage, string> = {
  en: 'Loading the question list...',
  ta: 'கேள்விப் பட்டியல் ஏறுகிறது...',
  hi: 'प्रश्न-सूची लोड हो रही है...',
};

const REPORT_LABEL: Record<ChatLanguage, string> = {
  en: 'Report',
  ta: 'அறிக்கை',
  hi: 'रिपोर्ट',
};

/** Label of the family-member picker: whose answers the chat gives. */
const PERSON_LABEL: Record<ChatLanguage, string> = {
  en: 'Person',
  ta: 'நபர்',
  hi: 'व्यक्ति',
};

/** First message on a family report: which member the chat answers about. */
const PERSON_OPEN_NOTE: Record<ChatLanguage, (name: string) => string> = {
  en: (n) => `This is a family report. I will answer about ${n} — pick another name below to switch.`,
  ta: (n) => `இது குடும்ப அறிக்கை. நான் ${n} பற்றி பதிலளிப்பேன் — மாற்ற கீழே வேறு பெயரைத் தேர்வு செய்யவும்.`,
  hi: (n) => `यह एक फैमिली रिपोर्ट है। मैं ${n} के बारे में उत्तर दूँगा — बदलने के लिए नीचे कोई और नाम चुनें।`,
};

/** After the customer switches the selected family member. */
const PERSON_SWITCHED_NOTE: Record<ChatLanguage, (name: string) => string> = {
  en: (n) => `Now answering about ${n}.`,
  ta: (n) => `இப்போது ${n} பற்றி பதிலளிக்கிறேன்.`,
  hi: (n) => `अब ${n} के बारे में उत्तर दे रहा हूँ।`,
};

const PERSON_FAILED: Record<ChatLanguage, string> = {
  en: 'That family member could not be selected.',
  ta: 'அந்த குடும்ப உறுப்பினரைத் தேர்வு செய்ய முடியவில்லை.',
  hi: 'उस फैमिली सदस्य को नहीं चुना जा सका।',
};

const NO_REPORT: Record<ChatLanguage, string> = {
  en: 'No report attached',
  ta: 'அறிக்கை இணைக்கப்படவில்லை',
  hi: 'कोई रिपोर्ट नहीं जुड़ी',
};

/** Shown after the customer moves the chat to one of their own reports. */
const ATTACHED_NOTE: Record<ChatLanguage, (title: string) => string> = {
  en: (t) => `Now reading your ${t} report.`,
  ta: (t) => `இப்போது உங்கள் ${t} அறிக்கையைப் படிக்கிறேன்.`,
  hi: (t) => `अब मैं आपकी ${t} रिपोर्ट पढ़ रहा हूँ।`,
};

const BIND_FAILED: Record<ChatLanguage, string> = {
  en: 'That report could not be attached to this conversation.',
  ta: 'அந்த அறிக்கையை இந்த உரையாடலுடன் இணைக்க முடியவில்லை.',
  hi: 'वह रिपोर्ट इस बातचीत से नहीं जोड़ी जा सकी।',
};

const MENU_FAILED: Record<ChatLanguage, string> = {
  en: 'The question list is not available right now. Please close and reopen the chat.',
  ta: 'கேள்விப் பட்டியல் இப்போது இல்லை. உரையாடலை மூடி மீண்டும் திறக்கவும்.',
  hi: 'प्रश्न-सूची अभी उपलब्ध नहीं है। कृपया चैट बंद करके फिर खोलें।',
};

const ADMIN_TEST_LABEL: Record<ChatLanguage, string> = {
  en: 'Admin test input (customers never see this)',
  ta: 'நிர்வாகி சோதனை உள்ளீடு (வாடிக்கையாளர்கள் பார்க்க மாட்டார்கள்)',
  hi: 'एडमिन परीक्षण इनपुट (ग्राहक इसे कभी नहीं देखते)',
};

const ADMIN_TEST_PLACEHOLDER: Record<ChatLanguage, string> = {
  en: 'Type a test question...',
  ta: 'சோதனை கேள்வியை எழுதவும்...',
  hi: 'परीक्षण प्रश्न लिखें...',
};

interface Props {
  customerId: string;
  customerName: string;
  /**
   * Language the opener passed in (report language from the dashboard, the
   * entitled report's language from the launcher). Once the server opens the
   * session it carries the bound report's language and that one wins, so the
   * chat always matches the language the customer selected for the report.
   */
  language: ChatLanguage;
  /** Bind the conversation to one report. Omit for a general chat. */
  orderId?: string;
  orderLabel?: string;
  /** Administrators have purchase- and daily-limit-free access. */
  isAdmin?: boolean;
  onClose?: () => void;
}

/** Routing for the next send: a curated option id, or nothing for admin free text. */
interface PendingAsk {
  questionId: string | null;
  complaintDetails: string;
}

const EMPTY_ASK: PendingAsk = { questionId: null, complaintDetails: '' };

export default function AiAstrologerPanel({
  customerId,
  customerName,
  language: initialLanguage,
  orderId,
  orderLabel,
  isAdmin = false,
  onClose,
}: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  /**
   * The language the conversation runs in. The server opens every session in
   * the language of the report it is bound to — the language the customer
   * picked when ordering — so from that point the report's language wins over
   * whatever the opener passed in.
   */
  const [sessionLanguage, setSessionLanguage] = useState<ChatLanguage | null>(null);
  const language = sessionLanguage ?? initialLanguage;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'status' | 'typing'>('idle');
  const [error, setError] = useState<string | null>(null);
  /** The question that got no answer, so "Retry" resends it instead of nothing. */
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [sessionOrderLabel, setSessionOrderLabel] = useState<string | undefined>(orderLabel);
  /** Guided menu state: the topic list, the open topic, and an option awaiting details. */
  const [categories, setCategories] = useState<GuidedCategory[] | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);
  /**
   * The customer's own delivered reports, and the one this conversation is
   * reading. The floating launcher opens with no report attached, so the
   * Wedding Matching / Baby Naming / Subha Muhurtham chapters need a way to
   * attach one here.
   */
  const [orders, setOrders] = useState<AttachableOrder[]>([]);
  const [boundOrderNumber, setBoundOrderNumber] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);
  /**
   * Family report: every member's name and the one this conversation answers
   * about. Single-person reports keep an empty list, so no picker shows.
   */
  const [persons, setPersons] = useState<ChatPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [pendingOption, setPendingOption] = useState<GuidedQuestion | null>(null);
  const pendingAsk = useRef<PendingAsk>(EMPTY_ASK);
  const failedAsk = useRef<PendingAsk | null>(null);
  const timers = useRef<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = useCallback((m: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [...prev, { ...m, id: Date.now() + Math.random(), createdAt: new Date().toISOString() } as ChatMessage]);
  }, []);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // Open (or rejoin) a session, then load history and the guided menu. A
  // failed session open is not recoverable in the UI, so it is surfaced
  // plainly rather than silently.
  useEffect(() => {
    let cancelled = false;
    // A panel reused for another account or report must not carry the previous
    // conversation's language or member list into the new session.
    setSessionLanguage(null);
    setPersons([]);
    setSelectedPersonId(null);
    (async () => {
      try {
        const s = await aiAstrologer.createSession({ orderId, language });
        if (cancelled) return;
        setSessionId(s.sessionId);
        // The server opens the session in the language of the bound report —
        // the language chosen at order time — so adopt it for every string
        // this panel renders from here on.
        setSessionLanguage(s.language);
        setBoundOrderNumber(s.orderNumber ?? null);
        setSessionOrderLabel(orderLabel || (s.orderNumber ? `Report #${s.orderNumber}` : undefined));
        // Family report: all member names arrive with the session, with the
        // first member preselected.
        const sessionPersons = s.persons ?? [];
        setPersons(sessionPersons);
        setSelectedPersonId(s.selectedPersonId ?? null);
        {
          // Scope the session's own language over the rest of the open: the
          // welcome, the menu and the follow-up calls all speak the report's
          // language, not the site picker the opener started with.
          const language = s.language;
          const h = await aiAstrologer.history(s.sessionId);
          if (cancelled) return;
          setMessages(h.messages);
          if (h.messages.length === 0) {
            // A delivered report gets a welcome that names it; anything else
            // (admins, report-less sessions) gets the general greeting.
            const serviceTitle = s.serviceType ? (SERVICE_TITLE[s.serviceType]?.[language] ?? s.serviceType) : null;
            push({
              role: 'system',
              language,
              content: s.orderNumber && serviceTitle
                ? ORDER_GREETING[language](customerName, serviceTitle, s.orderNumber)
                : GREETING[language](customerName),
            });
            // A family report names the member the chat starts with, so the
            // customer knows the picker below chooses whose answers these are.
            if (sessionPersons.length > 1) {
              push({
                role: 'system',
                language,
                content: PERSON_OPEN_NOTE[language](sessionPersons[0].name),
              });
            }
          }
          try {
            const menu = await aiAstrologer.options(language);
            if (cancelled) return;
            if (menu.categories?.length) {
              setCategories(menu.categories);
            } else {
              const fallback = buildLocalGuidedMenu(language, s.serviceType ? [s.serviceType] : [], isAdmin);
              if (fallback.length > 0) setCategories(fallback);
              else setMenuFailed(true);
            }
            setOrders(menu.orders ?? []);
          } catch {
            if (cancelled) return;
            const fallback = buildLocalGuidedMenu(language, s.serviceType ? [s.serviceType] : [], isAdmin);
            if (fallback.length > 0) {
              setCategories(fallback);
            } else {
              setMenuFailed(true);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open the chat.');
      }
    })();
    return () => {
      cancelled = true;
      clearTimers();
    };
    // customerId is the gate subject; a different account must never inherit a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, orderId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  const send = async (text: string) => {
    const question = text.trim();
    const ask = pendingAsk.current;
    if (!question || !sessionId || phase !== 'idle') return;
    // Customers always send a curated option; only admins may send free text.
    if (!ask.questionId && !isAdmin) return;

    setInput('');
    setError(null);
    setFailedQuestion(null);
    failedAsk.current = null;
    push({ role: 'customer', language, content: question });
    setPhase('status');

    const startedAt = Date.now();
    // The status line shows for 2-4s, then the dots. Both are cut short by the
    // 12s hard cap so local chart/source work is never padded.
    const statusFor = TIMING.statusMin + Math.random() * (TIMING.statusMax - TIMING.statusMin);
    timers.current.push(
      window.setTimeout(() => {
        if (Date.now() - startedAt < TIMING.hardCap) setPhase('typing');
      }, statusFor)
    );

    try {
      const reply = await aiAstrologer.ask(
        sessionId,
        ask.questionId
          ? { questionId: ask.questionId, question, ...(ask.complaintDetails ? { complaintDetails: ask.complaintDetails } : {}) }
          : { question },
        language,
      );
      clearTimers();

      const bubbles = reply.bubbles?.length ? reply.bubbles : [reply.content];
      // Show the bubbles one at a time, but stop waiting as soon as the cap is
      // reached - the remaining bubbles render immediately rather than never.
      bubbles.forEach((b, i) => {
        const delay = Math.min(i * TIMING.bubbleGap, Math.max(0, TIMING.hardCap - (Date.now() - startedAt)));
        timers.current.push(
          window.setTimeout(() => {
            push({
              role: 'assistant',
              language,
              content: b,
              areaId: reply.areaId,
              sources: i === bubbles.length - 1 ? reply.sources : null,
            });
          }, delay)
        );
      });

      timers.current.push(
        window.setTimeout(() => setPhase('idle'), Math.min(bubbles.length * TIMING.bubbleGap, TIMING.hardCap))
      );
    } catch (e) {
      clearTimers();
      setFailedQuestion(question);
      failedAsk.current = ask;
      const err = e as AiAstrologerError;
      if (err.status === 403) {
        setError(language === 'ta' ? err.messageTa : language === 'hi' ? err.messageHi : err.message);
      } else if (err.status === 429) {
        // Questions are unlimited now; a 429 can only come from an upstream
        // throttle, so surface its retry message without any counter.
        setError(err.message + (err.retryAfterSeconds ? ` (${err.retryAfterSeconds}s)` : ''));
      } else if (err.isSetupProblem) {
        // A server setup problem does not fix itself by retrying, so it is
        // named rather than hidden. The wording is the server's own: for an
        // administrator it says what to configure, for a customer it says the
        // assistant is not available yet. Both are more useful than a line
        // that reads as a temporary delay and never resolves.
        setError(err.message);
      } else {
        setError(RETRY_TEXT[language]);
      }
      // Back to idle, always. Leaving the phase at 'failed' disabled the send
      // button and made Enter do nothing, so one bad reply froze the whole
      // panel: every later question was silently dropped and the chat looked
      // permanently dead. The error bar above still offers the explicit retry.
      setPhase('idle');
    }
  };

  /**
   * Resends the question that got no answer. The bubble that never received a
   * reply is removed first, so a retry replaces it rather than asking twice.
   */
  const retry = () => {
    const question = failedQuestion;
    setError(null);
    setFailedQuestion(null);
    if (!question) return;
    pendingAsk.current = failedAsk.current ?? EMPTY_ASK;
    failedAsk.current = null;
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'customer') return [...prev.slice(0, i), ...prev.slice(i + 1)];
      }
      return prev;
    });
    void send(question);
  };

  const handoff = async () => {
    if (!sessionId) return;
    try {
      await aiAstrologer.requestHandoff(sessionId, input.trim() || messages[messages.length - 1]?.content || '', language);
      push({
        role: 'system',
        language,
        content: language === 'ta'
          ? 'நன்றி. உங்கள் கேள்வி எங்கள் ஜோதிடருக்கு அனுப்பப்பட்டுள்ளது.'
          : language === 'hi'
            ? 'धन्यवाद। आपका प्रश्न हमारे ज्योतिषी को भेज दिया गया है।'
            : 'Thank you. Your question has been sent to our astrologer.',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that.');
    }
  };

  /**
   * Moves the conversation onto one of the customer's own delivered reports
   * (or off it, with an empty orderNumber). The server re-checks that the
   * report belongs to this account before the chat will read from it.
   */
  const attachReport = async (orderNumber: string) => {
    if (!sessionId || binding) return;
    setBinding(true);
    setError(null);
    try {
      const res = await aiAstrologer.bind(sessionId, orderNumber);
      // The attached report's language takes over the conversation, so the
      // answers about it arrive in the same language as the report itself.
      setSessionLanguage(res.language);
      setBoundOrderNumber(res.orderNumber);
      setSessionOrderLabel(res.orderNumber ? `Report #${res.orderNumber}` : undefined);
      // A family report starts on its first member; a single-person report
      // shows no picker at all.
      setPersons(res.persons ?? []);
      setSelectedPersonId(res.selectedPersonId ?? null);
      push({
        role: 'system',
        language: res.language,
        content: res.serviceTitle ? ATTACHED_NOTE[res.language](res.serviceTitle) : NO_REPORT[res.language],
      });
    } catch {
      setError(BIND_FAILED[language]);
    } finally {
      setBinding(false);
    }
  };

  /**
   * Switches which family member the conversation answers about. The server
   * re-checks that the person belongs to the report bound to this session.
   */
  const selectPerson = async (personId: number) => {
    if (!sessionId || personId === selectedPersonId) return;
    setError(null);
    try {
      const res = await aiAstrologer.selectPerson(sessionId, personId);
      setSelectedPersonId(res.personId);
      setPersons(res.persons ?? []);
      push({
        role: 'system',
        language,
        content: PERSON_SWITCHED_NOTE[language](res.name),
      });
    } catch {
      setError(PERSON_FAILED[language]);
    }
  };

  /** A menu option was tapped: options that need details open the detail box, the rest send at once. */
  const tapOption = (option: GuidedQuestion) => {
    if (phase !== 'idle' || !sessionId) return;
    if (option.needsDetails) {
      setPendingOption(option);
      setInput('');
      setError(null);
      return;
    }
    pendingAsk.current = { questionId: option.id, complaintDetails: '' };
    void send(option.text);
  };

  /** Sends a complaint/support option together with its optional detail line. */
  const sendPendingOption = () => {
    if (!pendingOption || phase !== 'idle' || !sessionId) return;
    const details = input.trim();
    pendingAsk.current = { questionId: pendingOption.id, complaintDetails: details };
    const display = details ? `${pendingOption.text}\n${details}` : pendingOption.text;
    setPendingOption(null);
    void send(display);
  };

  /** Admin-only free-text test question. Customers never see this box. */
  const sendAdminTest = () => {
    if (!isAdmin || phase !== 'idle' || !sessionId || !input.trim()) return;
    pendingAsk.current = EMPTY_ASK;
    void send(input);
  };

  const openCategory = activeCategory ? (categories ?? []).find((c) => c.id === activeCategory) ?? null : null;
  const menuBusy = phase !== 'idle' || !sessionId;
  /** Whose answers these are: the selected family member, shown in the header. */
  const selectedPerson = persons.find((p) => p.id === selectedPersonId) ?? null;
  const personTag = persons.length > 1 && selectedPerson ? ` · ${selectedPerson.name}` : '';

  const bubbleClass = (role: string) =>
    role === 'customer'
      ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 rounded-2xl rounded-br-sm shadow-md shadow-amber-500/20'
      : role === 'system'
        ? 'bg-slate-100/80 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 text-xs italic rounded-xl border border-slate-200/60 dark:border-slate-700/60'
        : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-2xl rounded-bl-sm border border-slate-200/70 dark:border-slate-700/70 shadow-sm';

  const selectClass =
    'min-w-0 flex-1 appearance-none rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-7 py-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-40 cursor-pointer';

  const pickerRow = (label: string, control: React.ReactNode) => (
    <div className="flex items-center gap-2">
      <span className="shrink-0 w-[68px] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {label}
      </span>
      {control}
    </div>
  );

  return (
    <div className="relative flex flex-col h-[640px] max-h-[82vh] overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl shadow-slate-900/20">
      {/* Header - the name is fixed and never replaced by a person's name. */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 -bottom-10 h-24 w-24 rounded-full bg-indigo-500/20 blur-2xl" />
        <div className="relative flex items-center gap-3 px-4 py-3.5">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold tracking-tight">ASTRO SIVAM Astrologer</div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-300/80">
              <span className="truncate">
                {sessionOrderLabel || (isAdmin
                  ? 'Administrator access · unlimited questions'
                  : 'Unlimited questions')}
                {personTag}
              </span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-4 py-5 dark:from-slate-950 dark:to-slate-900"
      >
        {messages.map((m) => {
          const isCustomer = m.role === 'customer';
          const isSystem = m.role === 'system';
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isCustomer ? 'justify-end' : 'justify-start'}`}>
              {!isCustomer && !isSystem && (
                <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-amber-400 shadow-sm dark:bg-slate-800">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div className={`max-w-[82%] whitespace-pre-wrap px-3.5 py-2.5 text-[13.5px] leading-relaxed ${isSystem ? 'mx-auto max-w-full text-center' : ''} ${bubbleClass(m.role)}`}>
                {m.content}
                {m.sources && (
                  <div className="mt-2 border-t border-current/10 pt-1.5 text-[11px] opacity-60">{m.sources}</div>
                )}
              </div>
            </div>
          );
        })}

        {phase === 'status' && (
          <div className="flex items-center gap-2 pl-9 text-xs italic text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            {STATUS[language]}
          </div>
        )}
        {phase === 'typing' && (
          <div className="flex items-end gap-2">
            <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-amber-400 shadow-sm dark:bg-slate-800">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="flex gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-800/90">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <span>{error}</span>
          <button
            onClick={retry}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-white/70 px-2 py-1 font-semibold hover:bg-white dark:bg-rose-900/40"
          >
            <RefreshCw className="h-3 w-3" /> {language === 'ta' ? 'மீண்டும்' : language === 'hi' ? 'फिर से' : 'Retry'}
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-[10px] leading-snug text-slate-400 dark:border-slate-800">
        <ShieldCheck className="h-3 w-3 shrink-0" />
        <span className="text-center">{DISCLAIMER[language]}</span>
      </div>

      {/* Guided menu: topics, then the options of the open topic. Customers
          never get a free question box; complaint options get one short
          detail line for the human team. */}
      <div className="max-h-[42%] shrink-0 space-y-2.5 overflow-y-auto border-t border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {/* The report this conversation is reading. The service chapters
            (Wedding Matching, Baby Naming, Subha Muhurtham) are answered from
            the attached report, and the floating launcher starts with none. */}
        {orders.length > 0 &&
          pickerRow(
            REPORT_LABEL[language],
            <div className="relative min-w-0 flex-1">
              <select
                value={boundOrderNumber ?? ''}
                onChange={(e) => void attachReport(e.target.value)}
                disabled={binding || menuBusy}
                aria-label={REPORT_LABEL[language]}
                className={selectClass}
              >
                <option value="">{NO_REPORT[language]}</option>
                {orders.map((o) => (
                  <option key={o.orderNumber} value={o.orderNumber}>
                    {o.title} · #{o.orderNumber}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>,
          )}
        {/* Family report: every member's name, so the customer picks whose
            answers these are. Hidden for single-person reports. */}
        {persons.length > 1 &&
          pickerRow(
            PERSON_LABEL[language],
            <div className="relative min-w-0 flex-1">
              <select
                value={selectedPersonId ?? ''}
                onChange={(e) => void selectPerson(Number(e.target.value))}
                disabled={menuBusy || binding}
                aria-label={PERSON_LABEL[language]}
                className={selectClass}
              >
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>,
          )}

        {pendingOption ? (
          <div className="space-y-2.5 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
            <div className="text-xs font-semibold leading-snug text-slate-700 dark:text-slate-200">{pendingOption.text}</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={DETAILS_PLACEHOLDER[language]}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={sendPendingOption}
                disabled={menuBusy}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-2 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/25 hover:from-amber-300 hover:to-amber-400 disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> {DETAILS_SEND[language]}
              </button>
              <button
                onClick={() => { setPendingOption(null); setInput(''); }}
                disabled={menuBusy}
                className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                {CANCEL_TEXT[language]}
              </button>
            </div>
          </div>
        ) : openCategory ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-amber-100 hover:text-amber-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-500/15"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> {ALL_TOPICS[language]}
              </button>
              <div className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="mr-1">{openCategory.icon}</span>
                {openCategory.title}
              </div>
            </div>
            <div className="space-y-1.5">
              {openCategory.questions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => tapOption(q)}
                  disabled={menuBusy}
                  className="group flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[13px] font-medium text-slate-800 shadow-sm transition hover:-translate-y-px hover:border-amber-400/70 hover:shadow-md disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 transition group-hover:scale-125" />
                  <span className="flex-1 leading-snug">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : categories ? (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              {MENU_TITLE[language]}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  disabled={menuBusy}
                  title={c.hint}
                  className="group flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-2 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400/70 hover:shadow-md disabled:opacity-40 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900"
                >
                  <span className="text-xl leading-none transition group-hover:scale-110">{c.icon}</span>
                  <span className="text-center text-[11px] font-bold leading-tight text-slate-700 dark:text-slate-200">
                    {c.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : menuFailed ? (
          <div className="py-2 text-center text-xs text-rose-600 dark:text-rose-300">{MENU_FAILED[language]}</div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3 text-xs italic text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            {MENU_LOADING[language]}
          </div>
        )}

        {isAdmin && !pendingOption && (
          <div className="space-y-1.5 border-t border-dashed border-slate-200 pt-2.5 dark:border-slate-700">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {ADMIN_TEST_LABEL[language]}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAdminTest();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={ADMIN_TEST_PLACEHOLDER[language]}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                onClick={sendAdminTest}
                disabled={menuBusy || !input.trim() || !sessionId}
                className="cursor-pointer rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 p-2.5 text-slate-950 shadow-md shadow-amber-500/25 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-center pt-0.5">
          <button
            onClick={handoff}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10"
          >
            <UserRound className="h-3.5 w-3.5" /> {HANDOFF_LABEL[language]}
          </button>
        </div>
      </div>
    </div>
  );
}
