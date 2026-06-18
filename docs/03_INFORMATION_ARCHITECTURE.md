# Information Architecture

## 1. Product Structure

```text
Workspace
├── Projects
│   └── Review Sessions
│       └── Pages
│           └── Threads
│               └── Comments / Replies
├── Members
├── Settings
└── Billing
```

## 2. Main Objects

### Workspace

Top-level account container for a team or organization.

Contains:

- Members
- Projects
- Billing plan
- Workspace settings
- Audit events, V2

### Project

A product, website, client project, or app being reviewed.

Contains:

- Name
- Allowed domains
- Environments
- Review sessions
- Default permissions

### Review Session

A specific review container.

Examples:

- `Sprint 12 QA`
- `Landing Page Copy Review`
- `Client Acceptance Round 1`

Contains:

- Session metadata
- Share link
- Pages
- Threads
- Members and permissions
- Status

### Page

A normalized page identity inside a review session.

Contains:

- Page key
- Latest URL
- Title
- Fingerprint
- Environment
- Pins

### Pin

The visual marker attached to a page location.

Contains:

- Position
- Anchor metadata
- Status
- Thread id

### Thread

The discussion attached to a pin.

Contains:

- Original comment
- Replies
- Resolution state
- Participants

## 3. Navigation Model

### Chrome Extension Popup

Primary uses:

- Sign in / sign out
- Select workspace
- Select project
- Select or create review session
- Copy review link
- Toggle comment mode
- Toggle pins and resolved comments

Suggested popup hierarchy:

```text
Header
├── Workspace switcher
├── Current page summary
├── Session selector
├── Primary action: Comment
├── Secondary actions
│   ├── Copy review link
│   ├── Show resolved
│   └── Open dashboard
└── Account menu
```

The current page summary may expose page title, environment, and hostname. `pageKey` and raw pathname remain internal identifiers and must not appear as visible navigation or UI labels.

### Overlay Layer

Primary uses:

- Place pins
- Display pins
- Open thread drawer
- Show realtime presence
- Show connection and save status

Suggested overlay hierarchy:

```text
Overlay Root
├── Pin Layer
├── Placement Layer
├── Toolbar
├── Thread Drawer
└── Toast / Notification Layer
```

### Web Dashboard

MVP dashboard can be minimal.

Primary uses:

- Manage workspaces
- Manage projects
- View sessions
- Copy links
- Review all unresolved comments

Suggested dashboard hierarchy:

```text
Dashboard
├── Workspace Home
├── Projects
│   └── Project Detail
│       └── Sessions
│           └── Session Detail
├── Members
└── Settings
```

## 4. Object Relationships

```text
User ── Member ── Workspace
Workspace ── Project
Project ── Review Session
Review Session ── Page
Page ── Pin
Pin ── Thread
Thread ── Comment
Comment ── Reply relationship through parent_comment_id
```

## 5. Review Session Information Architecture

Session detail should organize information by:

- Overview
- Pages
- Open threads
- Resolved threads
- Members
- Share settings

MVP extension surface does not need all tabs, but the data structure should support them.

## 6. Page Matching IA

A page belongs to a session through a page key, not a raw URL only.

Recommended page key:

```text
{normalized_pathname}?{allowed_query_params}
```

Stored URL fields:

- Original URL
- Normalized URL
- Hostname
- Pathname
- Query params
- Hash
- Page title

For localhost, hostname and port are treated as environment context, not the primary page identity.

## 7. Permissions IA

Workspace roles:

- Admin
- Editor
- Commenter
- Viewer

Session-level role overrides:

- Optional in MVP.
- Required in V2 for client review links.

Guest access:

- V2 unless critical for early customer validation.
- MVP review links can require account login.

## 8. Status Taxonomy

### Session Status

- Draft
- Active
- Archived

### Thread Status

- Open
- Resolved
- Reopened
- Lost anchor

### Pin Anchor Status

- Attached
- Recovered
- Approximate
- Lost

## 9. Filtering And Sorting

MVP filters:

- Open
- Resolved
- Current page
- All pages in session

MVP sorting:

- Newest first
- Oldest first
- Page order, V2

## 10. Search

V2, but schema should allow:

- Search by comment body.
- Search by page path.
- Search by author.
- Search by status.
