import { useState } from 'react';
import XButton from './XButton';

function MediaPreview({ url, type }) {
  if (!url) {
    return (
      <div className="w-full aspect-video bg-x-black flex items-center justify-center">
        <svg className="w-10 h-10 text-x-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
        </svg>
      </div>
    );
  }

  if (type === 'tweet_video' || type === 'tweet_gif') {
    return (
      <div className="relative w-full aspect-video bg-black">
        <img src={url} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return <img src={url} alt="" className="w-full aspect-video object-cover bg-black" />;
}

function CardPreview({ card, prompts, previewTab, setPreviewTab }) {
  const isAfter = previewTab === 'after';

  // Before: show cover if available, otherwise main media
  // After: show main media
  const beforeUrl = card.hasCover ? (card.coverPreviewUrl || card.mediaPreviewUrl) : card.mediaPreviewUrl;
  const afterUrl = card.mediaPreviewUrl;
  const mediaUrl = isAfter ? afterUrl : beforeUrl;

  return (
    <div className="rounded-xl border border-x-border overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-x-border">
        <button
          onClick={() => setPreviewTab('before')}
          className={`flex-1 text-xs font-medium py-2.5 text-center transition-colors ${
            previewTab === 'before'
              ? 'text-x-blue border-b-2 border-x-blue'
              : 'text-x-secondary hover:text-x-text'
          }`}
        >
          Before Engagement
        </button>
        <button
          onClick={() => setPreviewTab('after')}
          className={`flex-1 text-xs font-medium py-2.5 text-center transition-colors ${
            previewTab === 'after'
              ? 'text-x-blue border-b-2 border-x-blue'
              : 'text-x-secondary hover:text-x-text'
          }`}
        >
          After Engagement
        </button>
      </div>

      {/* Tab content */}
      <div key={previewTab}>
        <p className="text-[11px] text-x-secondary bg-x-surface/50 px-4 py-1.5">
          {isAfter
            ? 'After a user posts your hashtag'
            : 'What users see before they engage'}
        </p>

        {mediaUrl ? (
          <img key={mediaUrl} src={mediaUrl} alt="" className="w-full aspect-video object-cover bg-black" />
        ) : (
          <MediaPreview url={null} />
        )}

        {isAfter ? (
          <div className="p-4 space-y-2">
            {card.thankYouText ? (
              <p className="text-sm text-x-text">{card.thankYouText}</p>
            ) : (
              <p className="text-xs text-x-secondary/50 italic">No thank-you text</p>
            )}
            {card.thankYouUrl && (
              <a href={card.thankYouUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-x-blue hover:underline truncate max-w-full">
                {card.thankYouUrl}
              </a>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {prompts[0]?.tweetText && (
              <p className="text-xs text-x-secondary">{prompts[0].tweetText}</p>
            )}
            {card.headline && (
              <p className="text-sm font-semibold text-x-text">{card.headline}</p>
            )}

            {/* CTA pill buttons */}
            {prompts.filter(p => p.hashtag).length > 0 ? (
              <div className="space-y-2">
                {prompts.filter(p => p.hashtag).map((p, i) => (
                  <button
                    key={i}
                    className="w-full bg-transparent border border-x-blue rounded-full px-4 py-2.5 text-sm text-x-blue text-center hover:bg-x-blue/10 transition-colors"
                    disabled
                  >
                    Post {p.hashtag?.startsWith('#') ? p.hashtag : `#${p.hashtag}`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-x-secondary/50 italic">No CTAs configured</p>
            )}

            <p className="text-[10px] text-x-secondary/40 leading-tight">
              By posting, you agree to the conversation rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublishModal({ card, user, isDraft, onConfirm, onCancel, publishResult, onDashboard }) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [previewTab, setPreviewTab] = useState('before');
  const [copied, setCopied] = useState(false);
  const prompts = card.prompts || [];

  const handleConfirm = async () => {
    setPublishing(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={publishResult ? undefined : onCancel}
      />

      {/* Modal */}
      <div className="relative bg-x-surface border border-x-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] overflow-y-auto fade-in">
        {publishResult ? (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-x-green/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-x-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-x-text">{isDraft ? 'Card Created' : 'Published!'}</h2>
            </div>

            {!isDraft && publishResult.tweetId && (
              <div className="bg-x-black rounded-xl border border-x-border p-4 space-y-2">
                <span className="text-xs text-x-secondary uppercase tracking-wider">Post</span>
                <a
                  href={`https://x.com/i/status/${publishResult.tweetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-x-blue hover:underline break-all"
                >
                  x.com/i/status/{publishResult.tweetId}
                </a>
              </div>
            )}

            {publishResult.cardUri && (
              <div className="bg-x-black rounded-xl border border-x-border p-4 space-y-2">
                <span className="text-xs text-x-secondary uppercase tracking-wider">Card URI</span>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-x-text font-mono break-all select-all flex-1">
                    {publishResult.cardUri}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(publishResult.cardUri);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="shrink-0 text-xs text-x-blue hover:underline"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-center pt-2">
              <XButton onClick={onDashboard}>Go to Dashboard</XButton>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <h2 className="text-lg font-semibold text-x-text">
              {isDraft ? 'Create Conversation Card' : 'Confirm & Publish'}
            </h2>

            {/* Card preview (draft) or Tweet + Card preview (publish) */}
            {isDraft ? (
              <CardPreview card={card} prompts={prompts} previewTab={previewTab} setPreviewTab={setPreviewTab} />
            ) : (
              <div className="bg-x-black rounded-xl border border-x-border overflow-hidden">
                {/* Tweet header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start gap-3">
                    {user?.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt=""
                        className="w-10 h-10 rounded-full shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-x-border shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold text-x-text">
                          {user?.name || 'You'}
                        </span>
                        <span className="text-sm text-x-secondary">
                          @{user?.username || 'handle'}
                        </span>
                      </div>
                      <p className="text-sm text-x-text mt-1 whitespace-pre-wrap break-words">
                        {previewTab === 'after'
                          ? (prompts.find(p => p.tweetText || p.hashtag)
                              ? `${prompts[0].tweetText || ''} ${prompts[0].hashtag || ''}`.trim() || 'No post text'
                              : 'No post text')
                          : (card.postText || 'No post text')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Embedded card preview */}
                <div className="mx-4 mb-4">
                  <CardPreview card={card} prompts={prompts} previewTab={previewTab} setPreviewTab={setPreviewTab} />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-x-red/10 border border-x-red/20 rounded-lg px-4 py-3 text-sm text-x-red">
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <XButton variant="ghost" onClick={onCancel} disabled={publishing}>
                Cancel
              </XButton>
              <XButton onClick={handleConfirm} disabled={publishing}>
                {publishing
                  ? (isDraft ? 'Creating...' : 'Publishing...')
                  : (isDraft ? 'Create Card' : 'Confirm & Publish')}
              </XButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
