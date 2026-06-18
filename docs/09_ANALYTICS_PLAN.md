# Analytics Plan

## 1. Analytics Goals

Analytics should answer:

1. Do users successfully create review sessions?
2. Do users leave comments directly on websites?
3. Do teams collaborate through replies?
4. Do comments get resolved?
5. Do pins stay attached after reload and route changes?
6. Do share links help other collaborators join?

## 2. North Star Metric

Resolved comments per review session.

Why:

- It measures real collaboration and completion.
- It avoids optimizing only for comment volume.
- It reflects the product promise: discuss directly on the website and close the loop.

## 3. Supporting Metrics

Acquisition:

- Extension installs
- Signup conversion
- Workspace created
- First project created

Activation:

- First session created
- First pin created
- First comment submitted
- First collaborator invited

Engagement:

- Weekly active users
- Active review sessions
- Comments per session
- Replies per thread
- Collaborators per session

Retention:

- Workspaces with active sessions week over week
- Repeat sessions per project
- Users returning to open threads

Quality:

- Anchor recovery rate
- Lost anchor rate
- Save failure rate
- Realtime delivery latency
- Extension activation failure rate

Monetization:

- Free workspace session limit reached
- Upgrade CTA clicked
- Plan conversion rate

## 4. Event Naming

Use snake_case.

Required MVP events:

- `extension_installed`
- `extension_opened`
- `user_signed_in`
- `workspace_created`
- `project_created`
- `session_created`
- `session_selected`
- `comment_mode_enabled`
- `pin_draft_created`
- `comment_created`
- `reply_created`
- `thread_resolved`
- `thread_reopened`
- `share_link_clicked`
- `share_link_copied`
- `review_link_opened`
- `anchor_recovery_attempted`
- `anchor_recovery_succeeded`
- `anchor_recovery_failed`
- `connection_lost`
- `connection_restored`

## 5. Event Properties

### Common Properties

Include on all events where possible:

| Property | Type | Description |
| --- | --- | --- |
| `user_id` | string | Auth user id. |
| `workspace_id` | string | Workspace id. |
| `project_id` | string | Project id. |
| `session_id` | string | Review session id. |
| `page_key` | string | Normalized page key. |
| `environment` | string | production, staging, localhost, unknown. |
| `extension_version` | string | Installed version. |
| `browser` | string | Browser name/version when available. |

### comment_created

```json
{
  "comment_id": "comment_id",
  "thread_id": "thread_id",
  "pin_id": "pin_id",
  "page_key": "/product",
  "environment": "localhost",
  "anchor_strategy": "selector",
  "anchor_status": "attached",
  "body_length": 42
}
```

### thread_resolved

```json
{
  "thread_id": "thread_id",
  "pin_id": "pin_id",
  "time_to_resolve_seconds": 86400,
  "reply_count": 3
}
```

### anchor_recovery_attempted

```json
{
  "pin_id": "pin_id",
  "strategy": "selector",
  "confidence": 0.98,
  "result": "success"
}
```

## 6. Funnels

### Activation Funnel

```text
extension_installed
→ user_signed_in
→ workspace_created
→ project_created
→ session_created
→ comment_created
```

### Collaboration Funnel

```text
session_created
→ share_link_copied
→ review_link_opened
→ reply_created
→ thread_resolved
```

### Comment Creation Funnel

```text
extension_opened
→ session_selected
→ comment_mode_enabled
→ pin_draft_created
→ comment_created
```

## 7. Key Dashboards

### Product Health

- Weekly active users
- Active workspaces
- Active sessions
- Comments created
- Threads resolved
- Resolve rate

### Collaboration Quality

- Replies per thread
- Collaborators per session
- Time to first reply
- Time to resolve
- Share link open rate

### Anchor Quality

- Anchor recovery rate
- Lost anchor rate
- Strategy success by type
- Recovery failures by environment
- Recovery failures by SPA/static page

### Extension Quality

- Extension opened
- Content script injection failure
- Connection lost/restored
- API error rate
- Save failure rate

## 8. Success Targets For MVP Beta

Suggested targets:

- 60% of new workspaces create at least one review session.
- 50% of created sessions receive at least one comment.
- 30% of commented sessions receive at least one reply.
- 40% of open threads are resolved within 7 days.
- Anchor recovery rate above 95% on stable pages.
- Lost anchor rate below 5%.

## 9. Privacy Rules

Do not send:

- Full page HTML.
- Passwords or input values.
- Cookies.
- Access tokens.
- Unredacted personal content outside comments intentionally submitted by users.

For comment analytics:

- Track body length, not body text.
- Store body text only in product database as user content.

## 10. Experiment Ideas

Post-MVP experiments:

- Default resolved pins hidden vs visible.
- Toolbar location.
- Comment mode shortcut prompt.
- Review link onboarding copy.
- Session creation from popup vs dashboard.
