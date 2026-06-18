# AGENTS

## 1. Purpose

This file defines how AI coding agents should work on WebComment.

The product goal is to build a Chrome extension-first website collaboration layer with Figma-style comments on real websites, staging environments, and localhost.

## 2. Source Of Truth

Read these files before making product or technical decisions:

1. `docs/01_PRD.md`
2. `docs/02_UX_FLOW.md`
3. `docs/03_INFORMATION_ARCHITECTURE.md`
4. `docs/08_TECH_SPEC.md`

Use the original `WebComment_PRD_v3.md` as historical source material.

## 3. MVP Boundaries

MVP must include:

- Chrome extension.
- Click webpage to create comment/annotation.
- Comment pins.
- Threaded discussion.
- Realtime multi-user collaboration.
- Replies.
- Resolve/reopen.
- Share review link.
- Any URL and localhost support.

Do not prioritize unless explicitly requested:

- AI features.
- Jira/Slack/Linear integrations.
- White-label agency portal.
- Full screenshot capture.
- Native mobile app.
- Complex admin console.

## 4. Product Principles

When uncertain, choose the option that best supports:

1. Stable comment anchoring.
2. Review session-centered collaboration.
3. Fast comment creation.
4. Clear resolved/open status.
5. Localhost and staging usability.

Never silently place a pin in a questionable location. Use approximate or lost states.

## 5. Technical Direction

Preferred implementation:

- Manifest V3 Chrome extension.
- TypeScript.
- React for popup and overlay.
- Shadow DOM for overlay isolation.
- Supabase Auth, Postgres, and Realtime for MVP backend.
- REST API plus realtime session channel.

Agents may choose another stack only if a user explicitly asks or the repository already establishes a different stack.

## 6. Extension Guidelines

Content script should:

- Mount overlay root.
- Capture anchor data.
- Recover pin positions.
- Watch route and DOM changes.
- Render pins and drawer.

Background service worker should:

- Coordinate auth/session state.
- Route messages.
- Inject content scripts.
- Manage pending review links.

Popup should:

- Select workspace/project/session.
- Start comment mode.
- Copy review link.
- Toggle resolved pins.

## 7. Anchor Requirements

Every created pin should store:

- URL
- Page key
- CSS selector
- XPath
- DOM path
- Text context
- Element rect
- Click offset ratio
- Viewport
- Scroll position
- Anchor mode: element or page
- Anchor revision

Recovery order:

1. CSS selector
2. XPath
3. Text recovery
4. DOM similarity
5. Lost pin state

Existing pins must support manual repositioning when the user has permission. A completed drag must capture a fresh anchor payload and persist it as one revisioned update; do not save viewport coordinates alone or write on every pointer move. Hover or keyboard focus should show the first-comment preview without selecting the thread.

## 8. Localhost Requirements

Do not bind review identity only to `localhost:port`.

Use:

- Session id
- Project id
- Page key
- Pathname
- Environment metadata

Review links should explain that another user must have equivalent local or staging access.

## 9. UI Guidelines

The overlay should be quiet and precise.

`pageKey` and raw pathname are internal-only. Never render them in the popup, toolbar, composer, comment list, thread detail, pin preview, toast, or empty state. They may still be used for matching, persistence, search indexing, APIs, and review-link encoding. When no page title exists, use a neutral user-facing label instead of falling back to `pageKey`.

Do:

- Keep the host website as the focus.
- Use compact controls.
- Use clear pin states.
- Keep drawer readable and work-focused.
- Preserve draft content on failures.

Do not:

- Add marketing-style UI to the product surface.
- Cover the whole page with heavy overlays.
- Mutate host page layout.
- Store sensitive input values.

## 10. Security And Privacy

Agents must avoid implementing broad page capture unless requested.

Do not store:

- Cookies
- Passwords
- Access tokens
- Full local storage
- Full page HTML by default
- Sensitive input values

Store only metadata needed for anchors and comments.

## 11. Testing Expectations

For anchor or overlay changes, add or update tests for:

- Selector generation.
- Page key normalization.
- Anchor recovery.
- SPA route changes.
- Localhost page matching.

For UI changes, manually verify:

- Normal website URL.
- Localhost URL.
- Reload and pin recovery.
- Resolved pin visibility.
- Realtime update with two sessions or browser contexts when possible.

## 12. Documentation Expectations

When adding major behavior:

- Update relevant docs in `/docs`.
- Keep API and database docs aligned.
- Add open questions when product decisions are not final.

## 13. Decision Defaults

If a decision is unclear:

- Prefer MVP simplicity.
- Prefer explicit error states.
- Prefer session-level concepts over URL-only concepts.
- Prefer reliable anchoring over visual cleverness.
- Prefer account-required sharing for MVP unless guest review is explicitly requested.
