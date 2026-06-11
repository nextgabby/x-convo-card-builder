import { useState, useEffect, useCallback } from 'react';

function isCompatibleRatio(aspectRatio, requiredRatio) {
  if (!requiredRatio || !aspectRatio) return true;
  // Parse "W:H" strings like "191:100", "16:9", "1.91:1"
  const parse = (str) => {
    const parts = str.split(':').map(Number);
    if (parts.length !== 2 || parts[1] === 0) return null;
    return parts[0] / parts[1];
  };
  const actual = parse(aspectRatio);
  const required = parse(requiredRatio);
  if (!actual || !required) return true;
  return Math.abs(actual - required) < 0.05; // ~2.5% tolerance
}

export default function MediaLibraryPicker({ open, onSelect, onClose, acceptTypes = 'both', requiredAspectRatio }) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  const mediaTypeFilter = acceptTypes === 'image' ? 'IMAGE' : acceptTypes === 'video' ? 'VIDEO' : undefined;

  const fetchItems = useCallback(async (cursor = null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('count', '50');
      if (mediaTypeFilter) params.set('media_type', mediaTypeFilter);

      const res = await fetch(`/api/media/studio?${params}`, { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load media library');
      }

      const data = await res.json();
      setItems((prev) => cursor ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mediaTypeFilter]);

  useEffect(() => {
    if (open) {
      setItems([]);
      setSelected(null);
      setNextCursor(null);
      fetchItems();
    }
  }, [open, fetchItems]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-x-surface border border-x-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[80vh] flex flex-col fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-x-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-x-text">Media Library</h2>
            {requiredAspectRatio && (
              <p className="text-[11px] text-x-secondary mt-0.5">
                Card images require 1.91:1 aspect ratio (e.g. 1200x628)
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-x-secondary hover:bg-x-border/50 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="bg-x-red/10 border border-x-red/20 rounded-lg px-4 py-3 text-sm text-x-red mb-4">
              {error}
            </div>
          )}

          {!loading && items.length === 0 && !error && (
            <p className="text-sm text-x-secondary text-center py-8">No media found in your library.</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item) => {
              const isSelected = selected?.mediaKey === item.mediaKey;
              const thumbUrl = item.posterUrl || item.mediaUrl;
              const isVideo = item.mediaType === 'VIDEO';
              const compatible = isVideo || isCompatibleRatio(item.aspectRatio, requiredAspectRatio);

              return (
                <button
                  key={item.mediaKey}
                  onClick={() => setSelected(item)}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-colors bg-x-black group ${
                    isSelected
                      ? 'border-x-blue'
                      : !compatible
                      ? 'border-transparent opacity-40 hover:opacity-70'
                      : 'border-transparent hover:border-x-border'
                  }`}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.fileName || ''}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-x-secondary">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                      </svg>
                    </div>
                  )}

                  {/* Video play icon overlay */}
                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Aspect ratio badge */}
                  {item.aspectRatio && requiredAspectRatio && !compatible && (
                    <div className="absolute top-1.5 left-1.5 bg-x-red/80 text-white text-[9px] px-1.5 py-0.5 rounded">
                      {item.aspectRatio}
                    </div>
                  )}

                  {/* Selection checkmark */}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-x-blue rounded-full flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {/* File name */}
                  {item.fileName && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                      <p className="text-[10px] text-white/80 truncate">{item.fileName}</p>
                    </div>
                  )}
                </button>
              );
            })}

            {/* Skeleton loaders */}
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="aspect-video rounded-lg bg-x-border/30 animate-pulse" />
            ))}
          </div>

          {/* Load more */}
          {nextCursor && !loading && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => fetchItems(nextCursor)}
                className="text-sm text-x-blue hover:underline"
              >
                Load more
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-x-border shrink-0">
          {selected && selected.mediaType !== 'VIDEO' && requiredAspectRatio && !isCompatibleRatio(selected.aspectRatio, requiredAspectRatio) ? (
            <p className="text-xs text-x-red">
              Wrong aspect ratio ({selected.aspectRatio || 'unknown'}) — card images need 1.91:1
            </p>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-x-secondary hover:text-x-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => selected && onSelect(selected)}
              disabled={!selected}
              className="px-4 py-2 text-sm font-semibold rounded-full transition-colors bg-x-blue text-white hover:bg-x-blue/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Use Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
