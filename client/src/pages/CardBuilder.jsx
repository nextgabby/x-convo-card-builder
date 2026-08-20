import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import StepIndicator from '../components/StepIndicator';
import MediaUploader from '../components/MediaUploader';
import PublishModal from '../components/PublishModal';
import XButton from '../components/XButton';
import { useCard } from '../hooks/useCards';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { recropImageFromUrl } from '../lib/cropImage';

const EMPTY_PROMPT = { hashtag: '', tweetText: '' };
const MIN_PROMPTS = 1;
const POLL_CHOICE_MAX = 25;
const POLL_DURATION_MIN = 5;
const POLL_DURATION_MAX = 10080;
const EMPTY_COLLECTION_ITEM = { mediaId: null, mediaKey: null, mediaType: null, previewUrl: null };
const COLLECTION_ITEM_MIN = 1;
const COLLECTION_ITEM_MAX = 5;
const COLLECTION_STEPS = ['Card Setup', 'Collection Items', 'Publish'];
const POLL_STEPS = ['Card Setup', 'Poll Options', 'Publish'];
const CONVO_STEPS = ['Card Setup', 'Engagement Prompts', 'Publish'];
const POLL_DURATIONS = [
  { label: '5 minutes', value: 5 },
  { label: '1 hour', value: 60 },
  { label: '6 hours', value: 360 },
  { label: '1 day', value: 1440 },
  { label: '3 days', value: 4320 },
  { label: '7 days', value: 10080 },
];

async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  return res.json();
}

async function recropCollectionItemsToCover(items, coverIsVideo) {
  const ratio = coverIsVideo ? '16:9' : '191:100';
  const next = [];
  for (const item of items) {
    if (!item.mediaId) {
      next.push(item);
      continue;
    }
    const url = item.previewUrl || `/api/media/preview/${item.mediaId}`;
    const { file, changed } = await recropImageFromUrl(url, ratio);
    if (!changed) {
      next.push(item);
      continue;
    }
    const uploaded = await uploadImageFile(file);
    next.push({
      mediaId: uploaded.mediaId,
      mediaKey: uploaded.mediaKey,
      mediaType: uploaded.mediaType,
      previewUrl: uploaded.previewUrl || `/api/media/preview/${uploaded.mediaId}`,
    });
  }
  return next;
}

export default function CardBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, handleUnauthorized } = useAuth();
  const { addToast } = useToast();
  const { card: existingCard, loading: cardLoading, update: updateExisting } = useCard(id);

  const [step, setStep] = useState(0);
  const [cardId, setCardId] = useState(id || null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const saveTimerRef = useRef(null);
  const skipAutosaveRef = useRef(false);

  // Form state
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [mediaId, setMediaId] = useState(null);
  const [mediaKey, setMediaKey] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [enableCover, setEnableCover] = useState(false);
  const [coverMediaId, setCoverMediaId] = useState(null);
  const [coverMediaKey, setCoverMediaKey] = useState(null);
  const [coverMediaType, setCoverMediaType] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [prompts, setPrompts] = useState([{ ...EMPTY_PROMPT }]);
  const [thankYouText, setThankYouText] = useState('');
  const [thankYouUrl, setThankYouUrl] = useState('');
  const [postText, setPostText] = useState('');
  const [promotedOnly, setPromotedOnly] = useState(true);
  const [publishOption, setPublishOption] = useState('immediate');
  const [cardType, setCardType] = useState(
    ['poll', 'collection'].includes(searchParams.get('type')) ? searchParams.get('type') : 'conversation'
  );
  const [pollChoices, setPollChoices] = useState(['', '']);
  const [pollDurationMinutes, setPollDurationMinutes] = useState(1440);
  const [mediaPollsEnabled, setMediaPollsEnabled] = useState(null);
  const [collectionItems, setCollectionItems] = useState(
    Array.from({ length: COLLECTION_ITEM_MAX }, () => ({ ...EMPTY_COLLECTION_ITEM }))
  );
  const [destinationUrl, setDestinationUrl] = useState('');

  const isPoll = cardType === 'poll';
  const isCollection = cardType === 'collection';
  const isConversation = !isPoll && !isCollection;

  // Load existing card data
  useEffect(() => {
    if (existingCard) {
      setName(existingCard.name || '');
      setHeadline(existingCard.headline || '');
      setMediaId(existingCard.media_id || null);
      setMediaKey(existingCard.media_key || null);
      setMediaType(existingCard.media_type || null);
      setCoverMediaId(existingCard.cover_media_id || null);
      setCoverMediaKey(existingCard.cover_media_key || null);
      setCoverMediaType(existingCard.cover_media_type || null);
      setCoverPreviewUrl(
        existingCard.cover_media_id
          ? `/api/media/preview/${existingCard.cover_media_id}`
          : null
      );
      setMediaPreviewUrl(
        existingCard.media_preview_url?.startsWith('/api/')
          ? existingCard.media_preview_url
          : existingCard.media_id
            ? `/api/media/preview/${existingCard.media_id}`
            : null
      );
      setEnableCover(!!existingCard.cover_media_key);
      // Map prompts — handle both old `headline` field and new `tweetText`
      const loadedPrompts = existingCard.prompts?.length > 0
        ? existingCard.prompts.map(p => ({
            hashtag: p.hashtag || '',
            tweetText: p.tweetText || p.headline || '',
          }))
        : [{ ...EMPTY_PROMPT }];
      while (loadedPrompts.length < MIN_PROMPTS) loadedPrompts.push({ ...EMPTY_PROMPT });
      setPrompts(loadedPrompts);
      setThankYouText(existingCard.thank_you_text || '');
      setThankYouUrl(existingCard.thank_you_url || '');
      setPostText(existingCard.post_text || existingCard.postText || '');
      setPromotedOnly(
        existingCard.promoted_only !== undefined
          ? !!existingCard.promoted_only
          : existingCard.promotedOnly !== undefined
          ? existingCard.promotedOnly
          : true
      );
      setCardType(existingCard.card_type || existingCard.cardType || 'conversation');
      const loadedChoices = existingCard.pollChoices?.length
        ? existingCard.pollChoices.map((choice) => choice || '')
        : ['', ''];
      while (loadedChoices.length < 2) loadedChoices.push('');
      setPollChoices(loadedChoices);
      setPollDurationMinutes(existingCard.pollDurationMinutes || existingCard.poll_duration_minutes || 1440);
      const loadedItems = existingCard.collectionItems?.length
        ? existingCard.collectionItems.map((item) => ({
            mediaId: item.mediaId || null,
            mediaKey: item.mediaKey || null,
            mediaType: item.mediaType || null,
            previewUrl: item.previewUrl || null,
          }))
        : [];
      while (loadedItems.length < COLLECTION_ITEM_MAX) loadedItems.push({ ...EMPTY_COLLECTION_ITEM });
      setCollectionItems(loadedItems.slice(0, COLLECTION_ITEM_MAX));
      setDestinationUrl(existingCard.destinationUrl || existingCard.destination_url || '');
    }
  }, [existingCard]);

  useEffect(() => {
    if (!isPoll) return;
    fetch('/api/account/features', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setMediaPollsEnabled(!!data.mediaPolls);
      })
      .catch(() => {});
  }, [isPoll]);

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (step < 2) {
          const err = validate(step);
          if (err) { setValidationError(err); return; }
          setValidationError(null);
          setStep((s) => s + 1);
        }
      }
      if (e.key === 'Escape' && showPublishModal && !publishResult) {
        setShowPublishModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, showPublishModal, publishResult]);

  const getFormData = useCallback(
    () => ({
      name,
      headline,
      mediaId,
      mediaKey,
      mediaType,
      coverMediaId: enableCover ? coverMediaId : null,
      coverMediaKey: enableCover ? coverMediaKey : null,
      coverMediaType: enableCover ? coverMediaType : null,
      mediaPreviewUrl,
      prompts,
      thankYouText,
      thankYouUrl,
      postText,
      promotedOnly,
      cardType,
      pollChoices,
      pollDurationMinutes,
      collectionItems,
      destinationUrl,
    }),
    [name, headline, mediaId, mediaKey, mediaType, enableCover, coverMediaId, coverMediaKey, coverMediaType, mediaPreviewUrl, prompts, thankYouText, thankYouUrl, postText, promotedOnly, cardType, pollChoices, pollDurationMinutes, collectionItems, destinationUrl]
  );

  const validate = (s) => {
    if (s === 0) {
      if (!mediaId) return isCollection ? 'Upload cover media before continuing.' : 'Upload card media before continuing.';
      if (!name.trim()) {
        if (isPoll) return 'Enter a poll name before continuing.';
        if (isCollection) return 'Enter a collection name before continuing.';
        return 'Enter a card name before continuing.';
      }
      if (isConversation && !headline.trim() && prompts.length < 2) return 'Enter a headline before continuing.';
      if (isCollection && !headline.trim()) return 'Enter a collection title before continuing.';
      if (isCollection) {
        if (!destinationUrl.trim()) return 'Enter a https destination URL before continuing.';
        try {
          if (new URL(destinationUrl.trim()).protocol !== 'https:') return 'Destination URL must use https.';
        } catch {
          return 'Destination URL must be a valid https URL.';
        }
      }
      const mainIsImage = mediaType && !mediaType.includes('video');
      const coverIsVideo = coverMediaType && coverMediaType.includes('video');
      if (isConversation && enableCover && mainIsImage && coverIsVideo) {
        return 'An image card cannot have a video cover. Use an image cover or change the main media to video.';
      }
    }
    if (s === 1 && isCollection) {
      const filled = collectionItems.filter((item) => item.mediaId);
      if (filled.length < COLLECTION_ITEM_MIN) return 'Upload at least one thumbnail image.';
      if (filled.length > COLLECTION_ITEM_MAX) {
        return `A collection ad can have at most ${COLLECTION_ITEM_MAX} thumbnail images.`;
      }
      const keys = [mediaKey, ...filled.map((item) => item.mediaKey)].filter(Boolean);
      if (new Set(keys).size !== keys.length) {
        return 'Each collection slide must use a different image.';
      }
    }
    if (s === 1 && isPoll) {
      const filled = pollChoices.map((choice) => choice.trim()).filter(Boolean);
      if (filled.length < 2) return 'Enter at least two poll choices.';
      if (filled.some((choice) => choice.length > POLL_CHOICE_MAX)) {
        return `Each poll choice must be ${POLL_CHOICE_MAX} characters or fewer.`;
      }
      const duration = Number(pollDurationMinutes);
      if (!Number.isInteger(duration) || duration < POLL_DURATION_MIN || duration > POLL_DURATION_MAX) {
        return `Poll duration must be between ${POLL_DURATION_MIN} minutes and 7 days.`;
      }
    }
    if (s === 1 && isConversation) {
      // First CTA is always required
      if (!prompts[0]?.hashtag?.trim()) return 'CTA 1 hashtag is required.';
      if (!prompts[0]?.tweetText?.trim()) return 'CTA 1 post prompt text is required.';
      // CTAs 2-4: optional, but if either field is filled, both must be filled
      for (let i = 1; i < prompts.length; i++) {
        const has = prompts[i]?.hashtag?.trim() || prompts[i]?.tweetText?.trim();
        if (has) {
          if (!prompts[i]?.hashtag?.trim()) return `CTA ${i + 1} hashtag is required when post prompt is set.`;
          if (!prompts[i]?.tweetText?.trim()) return `CTA ${i + 1} post prompt is required when hashtag is set.`;
        }
      }
      if (!thankYouText.trim()) return 'Thank you text is required.';
      if (thankYouUrl.trim()) {
        try {
          if (new URL(thankYouUrl.trim()).protocol !== 'https:') {
            return 'Thank you URL must use https.';
          }
        } catch {
          return 'Thank you URL must be a valid https URL.';
        }
      }
    }
    if (s === 2) {
      if (publishOption !== 'draft' && !postText.trim()) return 'Enter post text before publishing.';
    }
    return null;
  };

  // Autosave with debounce
  const autosave = useCallback(async () => {
    if (!cardId || skipAutosaveRef.current) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(getFormData()),
      });
      if (res.status === 401) handleUnauthorized();
    } catch {
      // Silent fail for autosave
    } finally {
      setSaving(false);
    }
  }, [cardId, getFormData, handleUnauthorized]);

  useEffect(() => {
    if (!cardId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(autosave, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [name, headline, mediaId, mediaType, enableCover, coverMediaId, coverMediaType, prompts, thankYouText, thankYouUrl, pollChoices, pollDurationMinutes, collectionItems, destinationUrl, autosave, cardId]);

  // Create card on first step transition if new
  const ensureCard = async () => {
    if (cardId) return cardId;
    const res = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(getFormData()),
    });
    if (!res.ok) throw new Error('Failed to create card');
    const card = await res.json();
    setCardId(card.id);
    window.history.replaceState(null, '', `/cards/${card.id}/edit`);
    return card.id;
  };

  const handleNext = async () => {
    const err = validate(step);
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    await ensureCard();
    setStep((s) => Math.min(s + 1, 2));
  };

  const handlePublish = async () => {
    const err = validate(step);
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    const cid = await ensureCard();
    await fetch(`/api/cards/${cid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(getFormData()),
    });

    setShowPublishModal(true);
  };

  const handleConfirmPublish = async () => {
    const isDraft = publishOption === 'draft';
    skipAutosaveRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      if (isCollection) {
        const coverIsVideo = mediaType && mediaType.includes('video');
        const items = await recropCollectionItemsToCover(collectionItems, coverIsVideo);
        setCollectionItems(items);
        const saveRes = await fetch(`/api/cards/${cardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...getFormData(), collectionItems: items }),
        });
        if (!saveRes.ok) throw new Error('Could not save recropped collection images.');
      }
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isDraft
          ? { cardId, draft: true }
          : { cardId, postText, promotedOnly }
        ),
      });

      if (!res.ok) {
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
        throw new Error(data.error || (isDraft ? 'Card creation failed' : 'Publish failed'));
      }

      const data = await res.json();
      setPublishResult({ tweetId: data.tweetId, cardUri: data.cardUri });
    } finally {
      skipAutosaveRef.current = false;
    }
  };

  const updatePrompt = (index, field, value) => {
    setPrompts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addPrompt = () => {
    if (prompts.length < 4) {
      setPrompts((prev) => [...prev, { ...EMPTY_PROMPT }]);
    }
  };

  const removePrompt = (index) => {
    if (index >= 1 && prompts.length > MIN_PROMPTS) {
      setPrompts((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updatePollChoice = (index, value) => {
    setPollChoices((prev) => {
      const next = [...prev];
      next[index] = value.slice(0, POLL_CHOICE_MAX);
      return next;
    });
  };

  const addPollChoice = () => {
    if (pollChoices.length < 4) {
      setPollChoices((prev) => [...prev, '']);
    }
  };

  const removePollChoice = (index) => {
    if (index >= 2 && pollChoices.length > 2) {
      setPollChoices((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updateCollectionItem = (index, mediaIdValue, type, key, previewUrl) => {
    setCollectionItems((prev) => {
      const next = [...prev];
      if (!mediaIdValue) {
        next[index] = { ...EMPTY_COLLECTION_ITEM };
        return next;
      }
      next[index] = {
        mediaId: mediaIdValue,
        mediaKey: key || next[index].mediaKey,
        mediaType: type || next[index].mediaType,
        previewUrl: previewUrl || next[index].previewUrl,
      };
      return next;
    });
  };

  if (id && cardLoading) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="skeleton h-8 w-64 mb-8" />
          <div className="space-y-4">
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-48 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar />

      <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <StepIndicator current={step} steps={isPoll ? POLL_STEPS : isCollection ? COLLECTION_STEPS : CONVO_STEPS} />

        <div className={`text-xs text-x-secondary mb-4 flex items-center gap-1.5 ${saving ? 'visible' : 'invisible'}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-x-blue animate-pulse" />
          Saving...
        </div>

        {/* Step 1: Card Setup */}
        {step === 0 && (
          <div className="space-y-6 fade-in">
            <h2 className="text-xl font-semibold text-x-text">
              {isPoll ? 'Media Poll' : isCollection ? 'Collection Ad' : 'Card Setup'}
            </h2>

            {isPoll && mediaPollsEnabled === false && (
              <p className="text-sm text-x-red bg-x-red/10 border border-x-red/20 rounded-lg px-4 py-3">
                This Ads account does not have Media Forward Polls enabled. Ask your X account manager to grant PROMOTED_MEDIA_POLLS before publishing.
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm text-x-secondary" htmlFor="card-name">
                {isPoll ? 'Poll Name' : isCollection ? 'Collection Name' : 'Card Name'}
              </label>
              <input
                id="card-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isPoll ? 'My Media Poll' : isCollection ? 'My Collection Ad' : 'My Conversation Card'}
                className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
              />
              <p className="text-xs text-x-secondary">
                Internal label only — not shown on post
              </p>
            </div>

            <MediaUploader
              label={isCollection ? 'Hero Media' : 'Card Media'}
              value={mediaId}
              previewUrl={mediaPreviewUrl}
              mediaType={mediaType}
              onChange={(id, type, key, previewUrl) => {
                setMediaId(id);
                if (type) setMediaType(type);
                if (key) setMediaKey(key);
                if (previewUrl) setMediaPreviewUrl(previewUrl);
                if (!id) { setMediaType(null); setMediaKey(null); setMediaPreviewUrl(null); }
              }}
              hintText={isCollection
                ? 'PNG, JPG, MP4, MOV — hero image, cropped to 1.91:1. This is the large image on top.'
                : isPoll
                ? 'PNG, JPG, MP4, MOV — images are cropped to 1.91:1, videos 16:9'
                : 'PNG, JPG, MP4, MOV — images are cropped to 1.91:1'}
              requiredAspectRatio="191:100"
            />

            {isCollection && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-x-secondary" htmlFor="collection-title">
                    Title
                  </label>
                  <div className="relative">
                    <input
                      id="collection-title"
                      type="text"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value.slice(0, 70))}
                      maxLength={70}
                      placeholder="Shop the collection"
                      className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-x-secondary">
                      {headline.length}/70
                    </span>
                  </div>
                  <p className="text-xs text-x-secondary">Shown on the card under the media</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-x-secondary" htmlFor="destination-url">
                    Destination URL
                  </label>
                  <input
                    id="destination-url"
                    type="url"
                    value={destinationUrl}
                    onChange={(e) => setDestinationUrl(e.target.value)}
                    placeholder="https://example.com/shop"
                    className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                  />
                  <p className="text-xs text-x-secondary">Must be https. Used for every collection item.</p>
                </div>
              </>
            )}

            {isConversation && (
              <>
            {/* Cover media toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  enableCover ? 'bg-x-blue' : 'bg-x-border'
                }`}
                onClick={() => setEnableCover(!enableCover)}
                role="switch"
                aria-checked={enableCover}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setEnableCover(!enableCover)}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    enableCover ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </div>
              <div>
                <span className="text-sm text-x-text">Cover media</span>
                <p className="text-xs text-x-secondary mt-0.5">
                  Show a different image/video before the user engages
                </p>
              </div>
            </label>

            {enableCover && (
              <>
                <MediaUploader
                  label="Cover Media"
                  value={coverMediaId}
                  previewUrl={coverPreviewUrl}
                  mediaType={coverMediaType}
                  onChange={(id, type, key, previewUrl) => {
                    setCoverMediaId(id);
                    if (type) setCoverMediaType(type);
                    if (key) setCoverMediaKey(key);
                    if (previewUrl) setCoverPreviewUrl(previewUrl);
                    if (!id) { setCoverMediaType(null); setCoverMediaKey(null); setCoverPreviewUrl(null); }
                  }}
                  requiredAspectRatio={mediaType && mediaType.includes('video') ? '16:9' : '191:100'}
                  hintText={mediaType && mediaType.includes('video')
                    ? 'PNG, JPG — cropped to 16:9 (e.g. 1920×1080)'
                    : 'PNG, JPG — cropped to 1.91:1 (e.g. 1200×628)'}
                  acceptTypes="image"
                  hideLibrary
                />
                <p className="text-xs text-x-secondary -mt-1">
                  Shown on the card before a user engages
                </p>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm text-x-secondary" htmlFor="headline">
                Headline
              </label>
              <div className="relative">
                <input
                  id="headline"
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value.slice(0, 70))}
                  maxLength={70}
                  placeholder="Card headline shown to users"
                  disabled={prompts.length >= 2}
                  className={`w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors ${prompts.length >= 2 ? 'opacity-40 cursor-not-allowed' : ''}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-x-secondary">
                  {headline.length}/70
                </span>
              </div>
              <p className="text-xs text-x-secondary">
                {prompts.length >= 2
                  ? 'Headline is not supported when using multiple CTAs — the X API treats them as mutually exclusive.'
                  : 'Displayed on the card — maps to the card title'}
              </p>
            </div>
              </>
            )}

            <div className="flex justify-end pt-4">
              <XButton onClick={handleNext}>Next</XButton>
            </div>
            {validationError && step === 0 && (
              <p className="text-sm text-x-red mt-2">{validationError}</p>
            )}
          </div>
        )}

        {/* Step 2: Poll options or engagement prompts */}
        {step === 1 && isCollection && (
          <div className="space-y-6 fade-in">
            <h2 className="text-xl font-semibold text-x-text">Collection Items</h2>
            <p className="text-xs text-x-secondary">
              Smaller images under the hero. X requires every slide to share the same aspect ratio — thumbnails are cropped to match the hero. At least one, up to five, each a different image.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {collectionItems.map((item, i) => (
                <MediaUploader
                  key={i}
                  label={`Thumbnail ${i + 1}`}
                  value={item.mediaId}
                  previewUrl={item.previewUrl}
                  mediaType={item.mediaType}
                  acceptTypes="image"
                  requiredAspectRatio={mediaType && mediaType.includes('video') ? '16:9' : '191:100'}
                  hintText={mediaType && mediaType.includes('video')
                    ? 'PNG, JPG — cropped to 16:9 to match the video hero'
                    : 'PNG, JPG — cropped to 1.91:1 to match the hero'}
                  onChange={(id, type, key, previewUrl) => updateCollectionItem(i, id, type, key, previewUrl)}
                />
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <XButton variant="ghost" onClick={() => { setValidationError(null); setStep(0); }}>
                Back
              </XButton>
              <XButton onClick={handleNext}>Next</XButton>
            </div>
            {validationError && (
              <p className="text-sm text-x-red mt-2 text-right">{validationError}</p>
            )}
          </div>
        )}

        {step === 1 && isPoll && (
          <div className="space-y-6 fade-in">
            <h2 className="text-xl font-semibold text-x-text">Poll Options</h2>
            <p className="text-xs text-x-secondary">
              2–4 choices, 25 characters each. The poll timer starts when the card is created on X, not when the post goes live — keep this as a local draft until you are ready to publish.
            </p>

            <div className="space-y-3">
              {pollChoices.map((choice, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-x-secondary" htmlFor={`poll-choice-${i}`}>
                      Choice {i + 1} {i < 2 && <span className="text-x-red">*</span>}
                    </label>
                    {i >= 2 && (
                      <button
                        type="button"
                        onClick={() => removePollChoice(i)}
                        className="text-xs text-x-red hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id={`poll-choice-${i}`}
                      type="text"
                      value={choice}
                      onChange={(e) => updatePollChoice(i, e.target.value)}
                      maxLength={POLL_CHOICE_MAX}
                      placeholder={i === 0 ? 'East' : i === 1 ? 'West' : 'Optional'}
                      className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-x-secondary">
                      {choice.length}/{POLL_CHOICE_MAX}
                    </span>
                  </div>
                </div>
              ))}
              {pollChoices.length < 4 && (
                <button type="button" onClick={addPollChoice} className="text-sm text-x-blue hover:underline">
                  + Add another choice
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-x-secondary" htmlFor="poll-duration">
                Duration
              </label>
              <select
                id="poll-duration"
                value={pollDurationMinutes}
                onChange={(e) => setPollDurationMinutes(Number(e.target.value))}
                className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text focus:border-x-blue focus:outline-none"
              >
                {POLL_DURATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-between pt-4">
              <XButton variant="ghost" onClick={() => { setValidationError(null); setStep(0); }}>
                Back
              </XButton>
              <XButton onClick={handleNext}>Next</XButton>
            </div>
            {validationError && (
              <p className="text-sm text-x-red mt-2 text-right">{validationError}</p>
            )}
          </div>
        )}

        {step === 1 && isConversation && (
          <div className="space-y-6 fade-in">
            <h2 className="text-xl font-semibold text-x-text">
              Engagement Prompts
            </h2>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-x-secondary uppercase tracking-wider">
                CTA Buttons
              </h3>
              <p className="text-xs text-x-secondary -mt-2">
                Each CTA creates a "Post #hashtag" button on the card. At least 1 required.
              </p>

              {prompts.map((prompt, i) => (
                <div
                  key={i}
                  className="bg-x-surface border border-x-border rounded-xl p-4 space-y-3 fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-x-secondary">
                      CTA {i + 1} {i < MIN_PROMPTS && <span className="text-x-red">*</span>}
                    </span>
                    {i >= 1 && (
                      <button
                        onClick={() => removePrompt(i)}
                        className="text-xs text-x-red hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-x-secondary" htmlFor={`hashtag-${i}`}>
                      Hashtag
                    </label>
                    <input
                      id={`hashtag-${i}`}
                      type="text"
                      value={prompt.hashtag}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val && !val.startsWith('#')) val = '#' + val;
                        updatePrompt(i, 'hashtag', val);
                      }}
                      placeholder="#YourHashtag"
                      className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-x-secondary" htmlFor={`tweet-text-${i}`}>
                      Post Prompt (Pre-Populated Text)
                    </label>
                    <div className="relative">
                      <input
                        id={`tweet-text-${i}`}
                        type="text"
                        value={prompt.tweetText}
                        onChange={(e) =>
                          updatePrompt(i, 'tweetText', e.target.value.slice(0, 256))
                        }
                        maxLength={256}
                        placeholder="The text that will be pre-filled in the user's tweet"
                        className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-x-secondary">
                        {prompt.tweetText.length}/256
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {prompts.length < 4 && (
                <button
                  onClick={addPrompt}
                  className="text-sm text-x-blue hover:underline"
                >
                  + Add another CTA
                </button>
              )}
            </div>

            <div className="h-px bg-x-border" />

            {/* Thank You */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-x-secondary uppercase tracking-wider">
                After Engagement
              </h3>

              <div className="space-y-2">
                <label className="text-sm text-x-secondary" htmlFor="ty-text">
                  Thank You Text <span className="text-x-red">*</span>
                </label>
                <div className="relative">
                  <input
                    id="ty-text"
                    type="text"
                    value={thankYouText}
                    onChange={(e) =>
                      setThankYouText(e.target.value.slice(0, 140))
                    }
                    maxLength={140}
                    placeholder="Thanks for joining the conversation!"
                    className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-x-secondary">
                    {thankYouText.length}/140
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-x-secondary" htmlFor="ty-url">
                  Thank You URL <span className="text-x-secondary/50">(optional)</span>
                </label>
                <input
                  id="ty-url"
                  type="url"
                  value={thankYouUrl}
                  onChange={(e) => setThankYouUrl(e.target.value)}
                  placeholder="https://example.com/thanks"
                  className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <XButton variant="ghost" onClick={() => { setValidationError(null); setStep(0); }}>
                Back
              </XButton>
              <XButton onClick={handleNext}>Next</XButton>
            </div>
            {validationError && step === 1 && (
              <p className="text-sm text-x-red mt-2 text-right">{validationError}</p>
            )}
          </div>
        )}

        {/* Step 3: Publish */}
        {step === 2 && (
          <div className="space-y-6 fade-in">
            <h2 className="text-xl font-semibold text-x-text">Publish</h2>
            {isPoll && (
              <p className="text-xs text-x-secondary">
                Publishing creates the poll on X immediately and starts the timer. Save as draft to keep it local only.
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm text-x-secondary" htmlFor="post-text">
                Post Text
              </label>
              <div className="relative">
                <textarea
                  id="post-text"
                  value={postText}
                  onChange={(e) =>
                    setPostText(e.target.value.slice(0, 280))
                  }
                  maxLength={280}
                  rows={4}
                  placeholder="What's happening?"
                  className="w-full bg-x-black border border-x-border rounded-xl px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors resize-none"
                />
                <span
                  className={`absolute right-3 bottom-3 text-xs ${
                    postText.length > 260
                      ? 'text-x-red'
                      : 'text-x-secondary'
                  }`}
                >
                  {postText.length}/280
                </span>
              </div>
            </div>

            {/* Promoted Only toggle */}
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    promotedOnly ? 'bg-x-blue' : 'bg-x-border'
                  }`}
                  onClick={() => setPromotedOnly(!promotedOnly)}
                  role="switch"
                  aria-checked={promotedOnly}
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && setPromotedOnly(!promotedOnly)
                  }
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      promotedOnly ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </div>
                <div>
                  <span className="text-sm text-x-text">
                    Nullcast (not visible on your timeline)
                  </span>
                  <p className="text-xs text-x-secondary mt-0.5">
                    Promoted-only posts are hidden from your profile but can be
                    used in ad campaigns
                  </p>
                </div>
              </label>
            </div>

            {/* Publish options */}
            <div className="space-y-3">
              <label className="text-sm text-x-secondary">Publish Options</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="publishOption"
                    value="immediate"
                    checked={publishOption === 'immediate'}
                    onChange={(e) => setPublishOption(e.target.value)}
                    className="w-4 h-4 accent-x-blue"
                  />
                  <span className="text-sm text-x-text">
                    Publish immediately
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="publishOption"
                    value="draft"
                    checked={publishOption === 'draft'}
                    onChange={(e) => setPublishOption(e.target.value)}
                    className="w-4 h-4 accent-x-blue"
                  />
                  <span className="text-sm text-x-text">
                    {isPoll ? 'Save as local draft' : 'Save as draft'}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <XButton variant="ghost" onClick={() => { setValidationError(null); setStep(1); }}>
                Back
              </XButton>
              <XButton onClick={handlePublish}>
                {publishOption === 'immediate' ? 'Publish Now' : 'Save Draft'}
              </XButton>
            </div>
            {validationError && step === 2 && (
              <p className="text-sm text-x-red mt-2 text-right">{validationError}</p>
            )}
          </div>
        )}
      </main>

      {/* Fixed mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden bg-x-black border-t border-x-border p-4 flex justify-between">
        {step > 0 ? (
          <XButton variant="ghost" size="sm" onClick={() => { setValidationError(null); setStep((s) => s - 1); }}>
            Back
          </XButton>
        ) : (
          <div />
        )}
        {step < 2 ? (
          <XButton size="sm" onClick={handleNext}>
            Next
          </XButton>
        ) : (
          <XButton size="sm" onClick={handlePublish}>
            {publishOption === 'immediate' ? 'Publish Now' : 'Save Draft'}
          </XButton>
        )}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <PublishModal
          card={{
            ...getFormData(),
            id: cardId,
            mediaPreviewUrl,
            coverPreviewUrl,
            hasCover: enableCover && !!coverMediaId,
          }}
          user={user}
          isDraft={publishOption === 'draft'}
          isPoll={isPoll}
          isCollection={isCollection}
          onConfirm={handleConfirmPublish}
          onCancel={() => setShowPublishModal(false)}
          publishResult={publishResult}
          onDashboard={() => navigate('/dashboard')}
        />
      )}
    </div>
  );
}
