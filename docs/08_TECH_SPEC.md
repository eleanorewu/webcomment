# Tech Spec

## 1. Architecture Overview

WebComment is a Chrome extension plus web backend.

```text
Chrome Extension
├── Popup UI
├── Content Script
├── Background Service Worker
├── Overlay UI
└── Shared Client SDK

Backend
├── Auth
├── REST API
├── Postgres Database
├── Realtime Channels
└── Web Dashboard
```

## 2. Recommended Stack

### Chrome Extension

- Manifest V3
- TypeScript
- React for popup and overlay
- Vite or Plasmo for extension build
- Shadow DOM for overlay isolation
- Zustand or Redux Toolkit for client state

### Backend

- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- Supabase Edge Functions or Next.js API routes

### Web Dashboard

- Next.js
- TypeScript
- Tailwind CSS or a small token-based CSS system

## 3. Chrome Extension Structure

```text
extension
├── manifest.json
├── src
│   ├── background
│   │   └── service-worker.ts
│   ├── content
│   │   ├── index.ts
│   │   ├── anchor
│   │   └── overlay-root.tsx
│   ├── popup
│   │   └── Popup.tsx
│   ├── overlay
│   │   ├── Toolbar.tsx
│   │   ├── PinLayer.tsx
│   │   └── ThreadDrawer.tsx
│   ├── shared
│   │   ├── api
│   │   ├── auth
│   │   ├── realtime
│   │   └── types
│   └── styles
└── public
    └── icons
```

## 4. Manifest V3 Permissions

Recommended MVP permissions:

```json
{
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"]
}
```

Permission strategy:

- Start with explicit user activation through the extension.
- Explain why all URLs are needed: users want to review any website and localhost.
- Avoid reading page data until a user selects a session or enters comment mode.

Guest Review Session activation rule:

WebComment is not a browsing tracker. It only activates for an explicit review session and stores the minimum page metadata required to place, recover, and synchronize user-created comments.

Activation can come from:

- Opening the popup and creating or selecting a session.
- Opening an invite or admin link.
- Joining a known session with invite link, password, and display name.

The extension must not silently upload visited URLs, full page HTML, cookies, local storage, passwords, sensitive form values, or unrelated browsing history.

Restricted pages:

- Chrome Web Store
- Browser internal pages
- Some extension pages

Show a friendly unavailable state when content scripts cannot run.

## 5. Content Script Responsibilities

The content script owns:

- Mounting the overlay root.
- Capturing page context.
- Handling comment mode click events.
- Creating anchor payloads.
- Recovering anchor positions.
- Rendering pins from backend data.
- Listening for SPA route changes.
- Communicating with popup/background.

It should not own:

- Long-lived auth token refresh.
- Billing or workspace management.
- Heavy dashboard flows.

## 6. Background Service Worker Responsibilities

The background worker owns:

- Auth/session coordination.
- Extension icon state.
- Message routing between popup and tabs.
- Opening review links.
- Injecting content scripts when needed.
- Storing lightweight extension preferences.
- Coordinating per-tab overlay activation with the Chrome action icon.
- While a tab overlay is active, setting that tab's action popup to an empty string so `action.onClicked` can close WebComment, then restoring the popup after deactivation.

## 7. Overlay Implementation

Mount strategy:

1. Create root element: `webcomment-root`.
2. Attach Shadow DOM.
3. Render React overlay.
4. Use fixed positioning and isolated styles.
5. Keep host page untouched outside event listeners and root element.

Z-index:

- Use near-max z-index, but allow internal layering.
- Avoid using multiple unrelated roots.

Pointer events:

- Overlay root defaults to `pointer-events: none`.
- Pins, toolbar, and drawer use `pointer-events: auto`.

Lifecycle:

- Keep `overlayActive` separate from `commentMode`.
- Popup start activates the overlay and enters comment placement in one message.
- Comment placement applies a custom annotation-pin-only SVG cursor to eligible host-page targets. Its rounded body, lower-left tail, brand-purple fill, white outline, and three white dots mirror the saved annotation style; it has no drop shadow or separate arrow. Use the lower-left tail as the hotspot and `crosshair` as fallback.
- `標註中` or `Escape` exits comment placement without unmounting.
- Toolbar `X` or an active Chrome action-icon click removes the root and all WebComment-owned listeners, timers, and history hooks.
- Activation and deactivation messages must be idempotent and scoped to the current tab.

## 8. Anchor Capture

On click, capture:

- URL
- Page key
- CSS selector
- XPath
- DOM path
- Text content near target
- Element rect
- Click offset ratio inside element
- Viewport size
- Scroll position
- Device pixel ratio

CSS selector generation should prefer:

1. Stable ids and data attributes.
2. ARIA labels or role hints.
3. Class names only when stable.
4. Structural nth-child as fallback.

Recommended stable attributes:

- `data-testid`
- `data-test`
- `data-cy`
- `data-qa`
- `id`
- `aria-label`

## 9. Anchor Recovery

Recovery tiers:

1. CSS selector.
2. XPath.
3. Text content match.
4. DOM similarity match.
5. Fallback to lost anchor.

Recovery output:

```ts
type AnchorRecoveryResult = {
  status: 'attached' | 'recovered' | 'approximate' | 'lost';
  strategy: 'selector' | 'xpath' | 'text' | 'similarity' | 'fallback';
  confidence: number;
  rect?: DOMRect;
};
```

Rules:

- Never place a pin with low confidence as if it is exact.
- If confidence is uncertain, mark approximate.
- If no reliable target exists, mark lost.

## 9.1 Pin Hover Preview

- Render one preview layer inside the existing Shadow DOM overlay.
- Open after 150ms and close 120ms after pointer leaves both pin and preview.
- Reuse the first comment already loaded for the page; hovering must not trigger one API request per pin.
- Position relative to the recovered viewport point and auto-flip/clamp at viewport edges.
- Use `pointerenter` and `pointerleave` rather than bubbling mouse events.
- Match keyboard focus behavior and set an accessible relationship between pin and preview.

## 9.2 Manual Anchor Repositioning

Gesture state machine:

```text
idle → pointerDown → dragging → saving → idle
                    ↘ cancelled
                    ↘ saveFailed → rollback
```

Implementation requirements:

- Use Pointer Events and pointer capture so the drag continues outside the 24px pin.
- Require 1px movement before entering `dragging`; otherwise handle the interaction as a click. Existing pins may enter this state while comment mode is active, and the drag flow must not change `commentMode`.
- Close hover preview when dragging starts and suppress the click following a completed drag.
- Render the dragged pin from live pointer coordinates without writing storage on every move.
- On drop, temporarily exclude overlay hit targets and call `elementFromPoint` to resolve the host-page target.
- Rebuild the complete anchor payload using the drop point, target element, and current viewport.
- Persist once on drop with the current `anchorRevision` and update local state optimistically.
- Roll back to the previous anchor on persistence failure or conflict.
- In realtime mode, apply `PIN_ANCHOR_UPDATED` only when its revision is newer than the local confirmed revision.
- Repositioning does not change the thread id, comment ids, or resolution status.

## 10. SPA Route Handling

Detect route changes through:

- `popstate`
- `hashchange`
- Monkey-patched `history.pushState`
- Monkey-patched `history.replaceState`
- MutationObserver fallback

On route change:

1. Recompute page context.
2. Match page key.
3. Fetch or filter pins for current page.
4. Run anchor recovery.
5. Re-render pin layer.

## 11. Realtime Sync

Use one session channel:

```text
session:{sessionId}
```

Client behavior:

- Optimistically render local draft after submit starts.
- Replace optimistic item with server item after success.
- Reconcile by idempotency key to avoid duplicates.
- Keep draft content on failure.

## 12. Review Link Handling

Review link format:

```text
https://app.webcomment.app/review/{sessionId}?pageKey=/product&threadId=optional
```

Expected behavior:

- If opened in browser with extension installed, dashboard page can message extension or instruct user to open target site.
- Extension stores pending session context.
- When matching target URL is opened, overlay activates the session.

Localhost behavior:

- Review link cannot force another user's localhost to exist.
- Show page key and instructions.
- Allow user to bind the session to their local host/port.

## 13. Security And Privacy

Principles:

- Do not capture page content unless needed to create anchors.
- Store only anchor metadata and user comments in MVP.
- Avoid screenshots in MVP unless explicitly added.
- Redact sensitive input values.
- Server-side access storage must use hashes for session passwords, invite secrets, owner tokens, and guest tokens.
- Production session passwords must use a salted password hashing scheme or KDF. Plain SHA-256 is only acceptable for local prototype tests and high-entropy capability token hashing.
- The extension may store current Review Session capability tokens locally for the active browser profile.
- Never upload host-site passwords, host-site access tokens, cookies, full local storage, or unrelated browsing data.

Sensitive element handling:

- Ignore password inputs.
- Avoid storing values from input, textarea, contenteditable by default.
- Store placeholder, label, or selector instead.

## 14. Testing Strategy

### Unit Tests

- Selector generation.
- XPath generation.
- Page key normalization.
- Anchor recovery scoring.
- Permission helpers.

### Integration Tests

- Create session.
- Create pin and first comment.
- Reply to thread.
- Resolve thread.
- Receive realtime events.

### Browser Tests

Use Playwright with extension support:

- Load extension.
- Open static test page.
- Create comment.
- Reload page and verify pin recovery.
- Test localhost URL.
- Test SPA route change.

### Manual QA

Must test:

- Production URL.
- Staging URL.
- `localhost`.
- Authenticated app.
- Responsive viewport.
- Dynamic list item.
- Deleted element.

## 15. Performance Targets

- Overlay mount under 300ms after activation.
- Pin render under 100ms for 100 pins.
- Anchor recovery under 500ms for 100 pins on a normal page.
- Comment submit visible to sender immediately.
- Realtime update visible to other user under 1 second.

## 16. Deployment

MVP environments:

- Local
- Staging
- Production

Chrome extension distribution:

- Local unpacked for development.
- Private Chrome Web Store listing for beta.
- Public listing after privacy policy, terms, and permission disclosure are ready.

## 17. Open Technical Questions

- Should the MVP use Plasmo or custom Vite extension setup?
- Should guest review links be included in MVP or require login?
- Should screenshots be entirely excluded from MVP?
- How much dashboard is required for launch?
- Should review sessions support domain allowlist from day one?
