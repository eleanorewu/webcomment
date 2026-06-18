# WebComment PRD

## 1. Product Vision

WebComment is a website collaboration layer that lets teams comment, annotate, discuss, and resolve decisions directly on real websites.

中文願景：讓任何網站都擁有接近 Figma Comment 的即時協作體驗。

## 2. Product Positioning

WebComment is not only a bug reporting tool. It is a review and collaboration layer for real web pages.

| Product | Main Position | WebComment Difference |
| --- | --- | --- |
| Figma Comment | Design file collaboration | WebComment works on live websites, staging, production, and localhost. |
| Marker.io | Bug reporting and issue capture | WebComment focuses on collaborative review sessions before issue handoff. |
| Pastel | Website feedback and client review | WebComment emphasizes stable anchoring, realtime team discussion, and Chrome extension-first usage. |

## 3. Target Users

### Product Designer

Needs to collect visual and interaction feedback directly on live web pages without taking screenshots.

### Frontend Engineer

Needs to understand exactly where a requested change belongs and whether it has been resolved.

### Product Manager

Needs a shared review session where decisions, status, and open questions are centralized.

### QA

V2 persona. Needs structured bug reports, browser metadata, screenshots, and issue tracker handoff.

### Client or Stakeholder

V2 persona. Needs a simple review link to leave feedback without understanding internal tools.

## 4. Jobs To Be Done

1. When I am reviewing a website, I want to click directly on the page to leave feedback, so I do not need screenshots and long explanation threads.
2. When I receive feedback as an engineer, I want to see the exact location and context, so I can fix it quickly.
3. When the team is reviewing together, I want every discussion to stay attached to the relevant page area, so decisions are easy to find later.
4. When feedback has been handled, I want to mark it resolved, so the team can separate active work from finished work.
5. When I need external review, I want to share a review link, so collaborators can access the right session and page context.

## 5. MVP Scope

The MVP must support:

1. Click on a webpage to create a comment or annotation.
2. Display comment pins on the webpage.
3. Threaded discussion attached to each pin.
4. Realtime multi-user collaboration.
5. Comment CRUD basics: create, edit, reply, and delete.
6. Replies inside a thread.
7. Mark comments as resolved.
8. Share review links.
9. Support any URL and localhost for development and staging review.
10. A right-side comment list for finding, searching, selecting, replying to, and resolving previous annotations.

## 6. Non-MVP Scope

These are intentionally excluded from MVP unless needed for core validation:

- Jira, Linear, GitHub Issues, Slack integrations.
- AI summary, categorization, or prioritization.
- Full screenshot/video capture workflow.
- White-label agency portal.
- Native mobile app.
- Public widget embed outside the Chrome extension.
- Advanced role administration beyond basic workspace membership.

## 7. Product Principles

### Principle 1: Anchors Must Be Trustworthy

Comments must stay attached to the right location. A misplaced pin is more harmful than a missing pin because it creates false context.

### Principle 2: Comments Belong To Review Sessions

A comment is not only tied to a URL. It belongs to a review session, a project, a page identity, and a specific anchor.

### Principle 3: Collaboration Comes Before Ticketing

The first product experience is discussion, decision, and resolution. Bug reporting and tracker handoff can come later.

### Principle 4: Works Wherever Teams Work

The extension must support production URLs, staging URLs, authenticated apps, private networks, and localhost.

## 8. Core Domain Model

```text
Workspace
└── Project
    └── Review Session
        └── Page
            └── Pin
                └── Thread
                    └── Comment / Reply
```

## 9. Review Session Model

A review session is the primary collaboration container.

Examples:

- Petlove Redesign QA
- Sprint 12 Review
- Homepage Copy Review
- Checkout Flow Acceptance

Each session has:

- Name
- Project
- Creator
- Status: active, archived
- Share link
- Allowed domains or page keys
- Members and permissions
- Pages reviewed inside the session
- Pins and threads

## 10. Page Identity

Page identity must work across environments.

The same page may appear as:

- `https://app.example.com/product`
- `https://staging.example.com/product`
- `http://localhost:3000/product`

MVP page matching should use:

- Review session id
- Normalized pathname
- Optional query allowlist
- Page fingerprint
- Environment label

## 11. Localhost Strategy

For localhost, comments should not be permanently bound to `localhost:3000` only.

The system should store:

- Page key: for example `/product`, `/team`, `/settings`
- Hostname: for example `localhost`
- Port: for context only
- Session id
- Project id
- Optional app version or build hash

This allows development machines and staging hosts to share review context when the page key is equivalent.

## 12. Key User Stories

### Create Pin

As a commenter, I can enter comment mode and click anywhere on the page to create a pin.

Acceptance criteria:

- Cursor and toolbar indicate comment mode.
- Click captures viewport position, element metadata, selector, XPath, and text context.
- A draft thread opens immediately.
- Empty draft can be cancelled without creating a pin.
- Submitted comment appears for all active collaborators in realtime.

### View Pins

As a reviewer, I can see pins on the webpage and open their threads.

Acceptance criteria:

- Pins display on top of the page without changing site layout.
- Hovering or keyboard-focusing a pin shows a compact preview of the first comment without selecting the thread or opening the comment list.
- Clicking the preview or pin opens the full thread.
- Pins remain visible after scroll and route changes when their anchor is recoverable.
- Resolved pins can be hidden or shown.
- Lost pins show a fallback state instead of appearing in the wrong place.

### Reposition Pin

As a comment author or editor, I can drag an existing pin to correct its location after the comment has been created.

Acceptance criteria:

- A short pointer movement remains a click; dragging begins only after a 4px movement threshold.
- The pin follows the pointer while dragging and shows a clear dragging state.
- Dropping on a page element captures a fresh hybrid anchor from the drop point.
- Dropping on page background stores an explicit page-position fallback and marks its lower recovery confidence.
- The new anchor persists after reload and broadcasts to active collaborators.
- A failed save restores the previous anchor and shows an error without losing the thread.
- Repositioning never changes the comment body, replies, or resolution state.

### Thread Discussion

As a team member, I can reply to a thread and see all discussion history.

Acceptance criteria:

- Thread shows author, timestamp, body, status, and replies.
- Replies update in realtime.
- Users can resolve and reopen when permitted.

### Share Review Link

As a session owner, I can share a review link that opens the correct session.

Acceptance criteria:

- Link encodes the session id.
- If extension is installed, it opens the target website with the active session.
- If extension is missing, the user sees an install or access instruction page.

## 13. Permissions

| Role | View | Comment | Reply | Resolve | Manage Session | Manage Members |
| --- | --- | --- | --- | --- | --- | --- |
| Viewer | Yes | No | No | No | No | No |
| Commenter | Yes | Yes | Yes | No | No | No |
| Editor | Yes | Yes | Yes | Yes | No | No |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

MVP can ship with Admin, Editor, and Commenter if Viewer adds unnecessary complexity.

## 14. Success Metrics

North star metric:

- Resolved comments per review session.

Supporting metrics:

- Weekly active users
- Active review sessions per workspace
- Comments created per session
- Reply rate
- Resolve rate
- Share link open rate
- Anchor recovery rate
- Lost anchor rate

MVP quality target:

- Anchor recovery rate greater than 95% on stable pages.
- Comment creation under 2 seconds after submit on normal network.
- Realtime propagation under 1 second for active collaborators.

## 15. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Anchor drift on dynamic pages | Pins appear in wrong locations | Hybrid anchoring and lost-pin fallback. |
| Extension permissions feel scary | Lower install conversion | Clear permission disclosure and minimal host permission strategy. |
| Authenticated sites vary widely | Review links may not open for all users | Session link explains required access and extension state. |
| Realtime complexity | Collaboration feels unreliable | Use Supabase Realtime or equivalent managed realtime layer for MVP. |
| Localhost mapping ambiguity | Comments appear on wrong dev page | Require session context and page key matching. |

## 16. MVP Definition Of Done

MVP is complete when a team can:

1. Install the Chrome extension.
2. Open any supported URL or localhost page.
3. Create or join a review session.
4. Click the page to leave a pinned comment.
5. See that pin from another browser/account in realtime.
6. Reply to the thread.
7. Resolve the thread.
8. Share a review link that reopens the correct session context.
9. Recover pin position after reload for stable DOM pages.
10. See a clear lost-pin state when the anchor cannot be recovered.
