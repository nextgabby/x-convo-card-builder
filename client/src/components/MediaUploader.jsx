import { useState, useRef, useCallback, useEffect } from 'react';
import MediaLibraryPicker from './MediaLibraryPicker';
import { cropImageFile, isCompatibleRatio, ratioLabel } from '../lib/cropImage';

function persistableMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('/api/media/')) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (['video.twimg.com', 'pbs.twimg.com', 'ton.twimg.com'].includes(parsed.hostname)) {
      return `/api/media/proxy?url=${encodeURIComponent(parsed.href)}`;
    }
  } catch {
    return null;
  }
  return null;
}

function captureVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = src;

    const cleanup = () => URL.revokeObjectURL(src);
    const fail = () => {
      cleanup();
      reject(new Error('Could not capture video thumbnail'));
    };

    video.onerror = fail;
    video.onloadeddata = () => {
      const grab = () => {
        const canvas = document.createElement('canvas');
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        const scale = Math.min(1, 1200 / w);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (blob) resolve(blob);
          else fail();
        }, 'image/jpeg', 0.82);
      };
      video.currentTime = 0.1;
      video.onseeked = grab;
    };
  });
}

export default function MediaUploader({
  value,
  onChange,
  label = 'Upload Media',
  acceptTypes = 'both',
  hintText,
  requiredAspectRatio,
  hideLibrary = false,
  previewUrl,
  mediaType: savedMediaType,
  aspect = 'video',
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const inputRef = useRef(null);

  const ACCEPT_MAP = {
    image: '.png,.jpg,.jpeg',
    video: '.mp4,.mov',
    both: '.png,.jpg,.jpeg,.mp4,.mov',
  };
  const ACCEPTED = ACCEPT_MAP[acceptTypes] || ACCEPT_MAP.both;
  const aspectClass = aspect === 'square' ? 'aspect-square' : 'aspect-video';

  useEffect(() => {
    setImgFailed(false);
    if (!value || !previewUrl) {
      if (!value) setPreview(null);
      return;
    }
    setPreview((prev) => {
      if (prev?.url?.startsWith('blob:')) return prev;
      const isVideo = savedMediaType && savedMediaType.includes('video');
      return {
        url: previewUrl,
        posterUrl: isVideo ? previewUrl : undefined,
        type: isVideo ? 'video' : 'image',
      };
    });
  }, [value, previewUrl, savedMediaType]);

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

      let uploadFile = file;
      if (isImage && requiredAspectRatio) {
        try {
          uploadFile = await cropImageFile(file, requiredAspectRatio);
        } catch (err) {
          setError(err.message);
          setUploading(false);
          return;
        }
      } else if (isImage) {
        const check = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (img.width < 800 || img.height < 314) {
              resolve({ error: `Image too small (${img.width}×${img.height}). Minimum 800px on the long edge.` });
              return;
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

      const url = URL.createObjectURL(uploadFile);
      setPreview({ url, type: isVideo ? 'video' : 'image' });

      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        if (isVideo) {
          try {
            const thumb = await captureVideoThumbnail(file);
            formData.append('thumbnail', thumb, 'thumb.jpg');
          } catch {
            // Preview can still be shown from the local blob for this session
          }
        }

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

        const { mediaId, mediaType, mediaKey, previewUrl: savedPreview } = await res.json();
        setProgress(100);
        if (savedPreview) {
          setPreview((prev) => (
            isVideo
              ? { ...prev, posterUrl: savedPreview }
              : { url: savedPreview, type: 'image' }
          ));
        }
        onChange?.(mediaId, mediaType, mediaKey, savedPreview || null);
      } catch (err) {
        setError(err.message);
        setPreview(null);
      } finally {
        setUploading(false);
      }
    },
    [onChange, acceptTypes, requiredAspectRatio]
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

  const handleLibrarySelect = async (item) => {
    const isVideo = item.mediaType === 'VIDEO';
    const needsCrop = !isVideo && requiredAspectRatio && (
      !item.aspectRatio || !isCompatibleRatio(item.aspectRatio, requiredAspectRatio)
    );

    if (needsCrop) {
      const source = persistableMediaUrl(item.mediaUrl) || persistableMediaUrl(item.posterUrl);
      if (!source) {
        setError(`Could not load this image to crop it to ${ratioLabel(requiredAspectRatio)}. Upload the file instead.`);
        setShowLibrary(false);
        return;
      }
      setShowLibrary(false);
      setError(null);
      setUploading(true);
      setProgress(0);
      try {
        const res = await fetch(source, { credentials: 'include' });
        if (!res.ok) throw new Error('Could not load library image');
        const blob = await res.blob();
        const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
        const file = new File([blob], item.fileName || 'library.jpg', { type });
        await handleFile(file);
      } catch (err) {
        setError(err.message || 'Could not crop library image');
        setUploading(false);
      }
      return;
    }

    const mediaCategory = item.mediaCategory
      ? item.mediaCategory.toLowerCase()
      : item.mediaType === 'VIDEO' ? 'tweet_video' : 'tweet_image';

    const posterUrl = persistableMediaUrl(item.posterUrl) || persistableMediaUrl(item.mediaUrl);
    const videoSrc = isVideo && item.mediaUrl
      ? persistableMediaUrl(item.mediaUrl)
      : null;

    if (posterUrl || videoSrc) {
      setPreview({
        url: videoSrc || posterUrl,
        posterUrl: posterUrl,
        type: isVideo ? 'video' : 'image',
      });
    }

    setError(null);
    setShowLibrary(false);
    onChange?.(item.mediaKey, mediaCategory, item.mediaKey, posterUrl || videoSrc);
  };

  const hasMedia = value && (preview || !uploading);
  const playableVideo = preview?.type === 'video' && (
    preview.url?.startsWith('blob:') || preview.url?.startsWith('/api/media/proxy')
  );

  return (
    <>
      {hasMedia ? (
        <div className="space-y-2">
          <label className="text-sm text-x-secondary">{label}</label>
          <div className="relative rounded-xl overflow-hidden border border-x-border">
            {preview && !imgFailed ? (
              playableVideo ? (
                <video
                  src={preview.url}
                  poster={preview.posterUrl || undefined}
                  controls
                  className={`w-full ${aspectClass} object-cover bg-black`}
                />
              ) : (
                <div className="relative">
                  <img
                    src={preview.posterUrl || preview.url}
                    alt="Upload preview"
                    className={`w-full ${aspectClass} object-cover bg-black`}
                    onError={() => setImgFailed(true)}
                  />
                  {preview.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className={`w-full ${aspectClass} bg-x-surface flex items-center justify-center`}>
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
            className={`border-2 border-dashed rounded-xl ${aspectClass} flex flex-col items-center justify-center px-4 text-center transition-colors cursor-pointer ${
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
