export const POLL_CHOICE_MAX = 25;
export const POLL_DURATION_MIN = 5;
export const POLL_DURATION_MAX = 10080;
export const POLL_CHOICE_KEYS = ['first_choice', 'second_choice', 'third_choice', 'fourth_choice'];

export function parsePollChoices(raw) {
  if (raw == null || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((choice) => String(choice ?? '').trim());
  } catch {
    return [];
  }
}

export function compactPollChoices(choices) {
  return (choices || []).map((choice) => String(choice ?? '').trim()).filter(Boolean);
}

export function pollChoicesToApiParams(choices) {
  const compact = compactPollChoices(choices).slice(0, 4);
  const params = {};
  compact.forEach((choice, i) => {
    params[POLL_CHOICE_KEYS[i]] = choice;
  });
  return params;
}

export function validatePollForPublish({ mediaKey, choices, durationMinutes }) {
  if (!mediaKey) return 'Card media is required before publishing a media poll.';
  const compact = compactPollChoices(choices);
  if (compact.length < 2) return 'A poll needs at least two choices.';
  if (compact.some((choice) => choice.length > POLL_CHOICE_MAX)) {
    return `Each poll choice must be ${POLL_CHOICE_MAX} characters or fewer.`;
  }
  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || duration < POLL_DURATION_MIN || duration > POLL_DURATION_MAX) {
    return `Poll duration must be between ${POLL_DURATION_MIN} and ${POLL_DURATION_MAX} minutes.`;
  }
  return null;
}
