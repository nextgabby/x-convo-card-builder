# CLAUDE.md — x-convo-card-builder (CardForge)

Behavioral guidelines to reduce common LLM coding mistakes, merged with project-specific instructions.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Project-Specific Rules

### Stack

- Frontend: React + Vite + TailwindCSS
- Backend: Node.js / Express
- Database: SQLite
- Auth: X OAuth 2.0 PKCE
- Deployment: Render
- Design: Dark mode X aesthetic (#000000 base, #1d9bf0 accent)

### X Ads API — Critical Gotchas

These are confirmed behaviors. Do NOT second-guess them or "fix" them:

- **Video Conversation Card parameter naming is inverted.** On `POST /accounts/:account_id/cards/video_conversation`, `media_key` = the UNLOCKED (post-engagement) video, `unlocked_media_key` = the LOCKED (pre-engagement/teaser) video. This is backwards from what you'd expect. Do not "correct" this.
- **`title` in the API = Headline in the UI**, not Card Name. Card Name is internal only.
- **Preview CTA must render as `Post #hashtag`**, not just the hashtag alone.
- **Post prompt text goes below media, above the CTA button.**
- **Nullcast posts** (`nullcast=true`) are the default for promoted content — they don't appear on the public timeline.
- The Ads API only allows `nullcast=true` for new posts.

### Form Field → API Parameter Mapping

Do not deviate from this mapping:

| Form Field | API Parameter | Notes |
|---|---|---|
| Card Name | `name` | Internal label, not shown on post |
| Headline | `title` | Required. Shown on the card |
| First Hashtag | `first_cta` | e.g. `#TeamA` |
| First Post Prompt | `first_cta_tweet` | Text prepopulated when user taps CTA |
| Second Hashtag | `second_cta` | Required |
| Second Post Prompt | `second_cta_tweet` | Required |
| Third Hashtag | `third_cta` | Optional |
| Third Post Prompt | `third_cta_tweet` | Optional |
| Fourth Hashtag | `fourth_cta` | Optional |
| Fourth Post Prompt | `fourth_cta_tweet` | Optional |
| Thank You Text | `thank_you_text` | Shown after engagement |
| Thank You URL | `thank_you_url` | Optional |

### OAuth 2.0 — Known Issue

This app uses confidential client credentials with PKCE. If auth breaks, check:

- Client type mismatch (confidential vs public) in the X Developer Portal
- Token refresh flow — don't silently swallow 401s, surface them

### Style Conventions

- Match existing TailwindCSS patterns already in the codebase.
- Dark mode is the only mode. Don't add light mode unless asked.
- Keep the X design language — no Material UI, no Bootstrap, no generic component libraries.

---

## Success Criteria for These Guidelines

These guidelines are working if:

- Fewer unnecessary changes in diffs
- Fewer rewrites due to overcomplication
- Clarifying questions come before implementation rather than after mistakes