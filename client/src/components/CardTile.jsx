import { useState } from 'react';

export default function CardTile({ card, onClick, onEdit, onDuplicate }) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const prompts = card.prompts || [];
  const firstHashtag = prompts[0]?.hashtag;
  const date = new Date((card.created_at || 0) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className="bg-x-surface border border-x-border rounded-xl overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:border-x-secondary/50 fade-in"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Media thumbnail */}
      <div className="aspect-video bg-x-black flex items-center justify-center overflow-hidden">
        {card.media_preview_url && !imgFailed ? (
          <img
            src={card.media_preview_url}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : card.media_id ? (
          <div className="w-full h-full bg-x-border/20 flex items-center justify-center text-x-secondary text-sm">
            Media
          </div>
        ) : (
          <svg className="w-10 h-10 text-x-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        )}
      </div>

      {/* Card info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-x-text font-medium text-sm truncate">
              {card.name || 'Untitled Card'}
            </h3>
            {firstHashtag && (
              <span className="text-x-blue text-xs mt-1 inline-block">
                {firstHashtag.startsWith('#') ? firstHashtag : `#${firstHashtag}`}
              </span>
            )}
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              card.status === 'published'
                ? 'bg-x-green/10 text-x-green'
                : 'bg-x-secondary/10 text-x-secondary'
            }`}
          >
            {card.status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>
        <p className="text-x-secondary text-xs mt-2">{date}</p>

        {/* Hover actions */}
        {hovered && (
          <div className="flex gap-2 mt-3 fade-in">
            <button
              className="text-xs text-x-blue hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
            >
              Edit
            </button>
            <button
              className="text-xs text-x-secondary hover:text-x-text"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate?.();
              }}
            >
              Duplicate
            </button>
            {card.status === 'published' && card.tweet_id && (
              <a
                href={`https://x.com/i/status/${card.tweet_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-x-secondary hover:text-x-blue"
                onClick={(e) => e.stopPropagation()}
              >
                View Post
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
