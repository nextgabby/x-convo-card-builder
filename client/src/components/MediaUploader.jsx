import { useState, useRef, useCallback } from 'react';
import MediaLibraryPicker from './MediaLibraryPicker';

export default function MediaUploader({ value, onChange, label = 'Upload Media', acceptTypes = 'both', hintText, requiredAspectRatio, hideLibrary = false }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const inputRef = useRef(null);

  const ACCEPT_MAP = {
    image: '.png,.jpg,.jpeg',
    video: '.mp4,.mov',
    both: '.png,.jpg,.jpeg,.mp4,.mov',
  };
  const ACCEPTED = ACCEPT_MAP[acceptTypes] || ACCEPT_MAP.both;

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;

      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) {
        setError('Please upload a PNG, JPG, MP4, or MOV file');
        return;
      }

      if (acceptTypes === 'image' && !isImage) {
        setError('Only image files (PNG, JPG) are allowed here');
        return;
      }

      if (acceptTypes === 'video' && !isVideo) {
        setError('Only video files (MP4, MOV) are allowed here');
        return;
      }

      setError(null);
      setUploading(true);
      setProgress(0);

      // Validate image dimensions and aspect ratio
      if (isImage) {
        const check = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            // Minimum dimensions required by X Ads API
            if (img.width < 800 || img.height < 314) {
              resolve({ error: `Image too small (${img.width}×${img.height}). Minimum 800×314 pixels required.` });
              return;
            }
            // Check aspect ratio if required
            if (requiredAspectRatio) {
              const [rw, rh] = requiredAspectRatio.split(':').map(Number);
              const required = rw / rh;
              const actual = img.width / img.height;
              if (Math.abs(actual - required) >= 0.05) {
                const label = required > 1.9 ? '1.91:1 (e.g. 1200×628)' : '16:9 (e.g. 1920×1080)';
                resolve({ error: `Image must be ${label} aspect ratio. Current: ${img.width}×${img.height}` });
                return;
              }
            }
            resolve({ ok: true });
          };
          img.onerror = () => resolve({ ok: true });
          img.src = URL.createObjectURL(file);
        });
        if (check.error) {
          setError(check.error);
          setUploading(false);
          return;
        }
      }

      const url = URL.createObjectURL(file);
      setPreview({ url, type: isVideo ? 'video' : 'image' });

      try {
        const formData = new FormData();
        formData.append('file', file);

        const progressInterval = setInterval(() => {
          setProgress((p) => Math.min(p + 10, 90));
        }, 200);

        const res = await fetch('/api/media/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        clearInterval(progressInterval);

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const { mediaId, mediaType, mediaKey } = await res.json();
        setProgress(100);
        onChange?.(mediaId, mediaType, mediaKey, url);
      } catch (err) {
        setError(err.message);
        setPreview(null);
      } finally {
        setUploading(false);
      }
    },
    [onChange]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = () => {
    setPreview(null);
    setProgress(0);
    setError(null);
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleLibrarySelect = (item) => {
    const mediaCategory = item.mediaCategory
      ? item.mediaCategory.toLowerCase()
      : item.mediaType === 'VIDEO' ? 'tweet_video' : 'tweet_image';

    const isVideo = item.mediaType === 'VIDEO';
    // For videos, use the poster as thumbnail and proxy the actual video URL for playback.
    // video.twimg.com URLs require auth and 403 in the browser directly.
    const posterUrl = item.posterUrl || null;
    const videoSrc = isVideo && item.mediaUrl
      ? `/api/media/proxy?url=${encodeURIComponent(item.mediaUrl)}`
      : null;
    const previewUrl = posterUrl || item.mediaUrl;

    if (previewUrl || videoSrc) {
      setPreview({
        url: videoSrc || previewUrl,
        posterUrl: posterUrl,
        type: isVideo ? 'video' : 'image',
      });
    }

    setError(null);
    setShowLibrary(false);
    onChange?.(item.mediaKey, mediaCategory, item.mediaKey, posterUrl || previewUrl);
  };

  // Show uploaded state: either we have a local preview or a saved media ID
  const hasMedia = value && (preview || !uploading);

  return (
    <>
      {hasMedia ? (
        <div className="space-y-2">
          <label className="text-sm text-x-secondary">{label}</label>
          <div className="relative rounded-xl overflow-hidden border border-x-border">
            {preview ? (
              preview.type === 'video' ? (
                <video
                  src={preview.url}
                  poster={preview.posterUrl || undefined}
                  controls
                  className="w-full aspect-video object-cover bg-black"
                />
              ) : (
                <img
                  src={preview.url}
                  alt="Upload preview"
                  className="w-full aspect-video object-cover bg-black"
                />
              )
            ) : (
              // No local preview but media ID exists (loaded from saved card)
              <div className="w-full aspect-video bg-x-surface flex items-center justify-center">
                <div className="text-center space-y-2">
                  <svg className="w-10 h-10 mx-auto text-x-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-x-secondary">Media uploaded</p>
                  <p className="text-xs text-x-secondary/50">ID: {value}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 w-8 h-8 bg-black/70 text-white rounded-full flex items-center justify-center text-sm hover:bg-black/90 transition-colors"
              aria-label="Remove media"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-sm text-x-secondary">{label}</label>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragging
                ? 'border-x-blue bg-x-blue/5'
                : error
                ? 'border-x-red/50'
                : 'border-x-border hover:border-x-secondary'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {uploading ? (
              <div className="space-y-3">
                <div className="text-sm text-x-secondary">Uploading...</div>
                <div className="w-full h-1.5 bg-x-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-x-blue rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-xs text-x-secondary">{progress}%</div>
              </div>
            ) : (
              <div className="space-y-2">
                <svg
                  className="w-8 h-8 mx-auto text-x-secondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-sm text-x-text">
                  Drag and drop or <span className="text-x-blue">browse</span>
                </p>
                <p className="text-xs text-x-secondary">
                  {hintText || (acceptTypes === 'image'
                    ? 'PNG, JPG — min 800px'
                    : acceptTypes === 'video'
                    ? 'MP4, MOV'
                    : 'PNG, JPG, MP4, MOV — min 800px for images')}
                </p>
                {!hideLibrary && (
                  <p className="text-xs text-x-secondary mt-1">
                    or{' '}
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-x-blue hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLibrary(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          setShowLibrary(true);
                        }
                      }}
                    >
                      choose from Media Library
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-x-red">{error}</p>}
        </div>
      )}

      {!hideLibrary && (
        <MediaLibraryPicker
          open={showLibrary}
          onSelect={handleLibrarySelect}
          onClose={() => setShowLibrary(false)}
          acceptTypes={acceptTypes}
          requiredAspectRatio={requiredAspectRatio}
        />
      )}
    </>
  );
}
