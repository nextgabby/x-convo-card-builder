import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import StepIndicator from '../components/StepIndicator';
import MediaUploader from '../components/MediaUploader';
import PublishModal from '../components/PublishModal';
import XButton from '../components/XButton';
import { useCard } from '../hooks/useCards';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

const EMPTY_PROMPT = { hashtag: '', tweetText: '' };
const MIN_PROMPTS = 1;

export default function CardBuilder() {
  const { id } = useParams();
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
      setMediaPreviewUrl(existingCard.media_preview_url || null);
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
    }
  }, [existingCard]);

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
    }),
    [name, headline, mediaId, mediaKey, mediaType, enableCover, coverMediaId, coverMediaKey, coverMediaType, mediaPreviewUrl, prompts, thankYouText, thankYouUrl, postText, promotedOnly]
  );

  const validate = (s) => {
    if (s === 0) {
      if (!mediaId) return 'Upload card media before continuing.';
      if (!name.trim()) return 'Enter a card name before continuing.';
      if (!headline.trim() && prompts.length < 2) return 'Enter a headline before continuing.';
      const mainIsImage = mediaType && !mediaType.includes('video');
      const coverIsVideo = coverMediaType && coverMediaType.includes('video');
      if (enableCover && mainIsImage && coverIsVideo) {
        return 'An image card cannot have a video cover. Use an image cover or change the main media to video.';
      }
    }
    if (s === 1) {
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
    }
    if (s === 2) {
      if (publishOption !== 'draft' && !postText.trim()) return 'Enter post text before publishing.';
    }
    return null;
  };

  // Autosave with debounce
  const autosave = useCallback(async () => {
    if (!cardId) return;
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
  }, [name, headline, mediaId, mediaType, enableCover, coverMediaId, coverMediaType, prompts, thankYouText, thankYouUrl, autosave, cardId]);

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
      const data = await res.json();
      throw new Error(data.error || (isDraft ? 'Card creation failed' : 'Publish failed'));
    }

    const data = await res.json();
    setPublishResult({ tweetId: data.tweetId, cardUri: data.cardUri });
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
        <StepIndicator current={step} />

        {saving && (
          <div className="text-xs text-x-secondary mb-4 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-x-blue animate-pulse" />
            Saving...
          </div>
        )}

        {/* Step 1: Card Setup */}
        {step === 0 && (
          <div className="space-y-6 fade-in">
            <h2 className="text-xl font-semibold text-x-text">Card Setup</h2>

            <div className="space-y-2">
              <label className="text-sm text-x-secondary" htmlFor="card-name">
                Card Name
              </label>
              <input
                id="card-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Conversation Card"
                className="w-full bg-x-black border border-x-border rounded-lg px-4 py-3 text-sm text-x-text placeholder:text-x-secondary/50 focus:border-x-blue focus:outline-none transition-colors"
              />
              <p className="text-xs text-x-secondary">
                Internal label only — not shown on post
              </p>
            </div>

            <MediaUploader
              label="Card Media"
              value={mediaId}
              onChange={(id, type, key, previewUrl) => {
                setMediaId(id);
                if (type) setMediaType(type);
                if (key) setMediaKey(key);
                if (previewUrl) setMediaPreviewUrl(previewUrl);
                if (!id) { setMediaType(null); setMediaKey(null); setMediaPreviewUrl(null); }
              }}
              hintText="PNG, JPG, MP4, MOV — images must be 1.91:1 ratio (e.g. 1200×628)"
              requiredAspectRatio="191:100"
            />

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
                  onChange={(id, type, key, previewUrl) => {
                    setCoverMediaId(id);
                    if (type) setCoverMediaType(type);
                    if (key) setCoverMediaKey(key);
                    if (previewUrl) setCoverPreviewUrl(previewUrl);
                    if (!id) { setCoverMediaType(null); setCoverMediaKey(null); setCoverPreviewUrl(null); }
                  }}
                  requiredAspectRatio={mediaType && mediaType.includes('video') ? '16:9' : '191:100'}
                  hintText={mediaType && mediaType.includes('video')
                    ? 'PNG, JPG — must be 16:9 ratio (e.g. 1920×1080)'
                    : 'PNG, JPG — must be 1.91:1 ratio (e.g. 1200×628)'}
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

            <div className="flex justify-end pt-4">
              <XButton onClick={handleNext}>Next</XButton>
            </div>
            {validationError && step === 0 && (
              <p className="text-sm text-x-red mt-2">{validationError}</p>
            )}
          </div>
        )}

        {/* Step 2: Engagement Prompts */}
        {step === 1 && (
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
                  <span className="text-sm text-x-text">Save as draft</span>
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
          onConfirm={handleConfirmPublish}
          onCancel={() => setShowPublishModal(false)}
          publishResult={publishResult}
          onDashboard={() => navigate('/dashboard')}
        />
      )}
    </div>
  );
}
