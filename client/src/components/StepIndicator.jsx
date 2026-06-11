const STEPS = ['Card Setup', 'Engagement Prompts', 'Publish'];

export default function StepIndicator({ current = 0 }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                i < current
                  ? 'bg-x-blue text-white'
                  : i === current
                  ? 'bg-x-blue text-white'
                  : 'bg-x-border text-x-secondary'
              }`}
            >
              {i < current ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm hidden sm:inline ${
                i <= current ? 'text-x-text' : 'text-x-secondary'
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-8 h-px ${
                i < current ? 'bg-x-blue' : 'bg-x-border'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
