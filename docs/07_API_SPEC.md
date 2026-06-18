# API Spec

## 1. API Style

MVP can use REST endpoints backed by Supabase. Realtime updates are delivered through websocket channels.

Base URL:

```text
https://api.webcomment.app/v1
```

Local development:

```text
http://localhost:54321/functions/v1
```

## 2. Authentication

Use bearer token:

```http
Authorization: Bearer <access_token>
```

All endpoints require authentication for MVP unless explicitly marked public.

## 3. Common Types

### PageContext

```json
{
  "url": "http://localhost:3000/product",
  "title": "Product",
  "hostname": "localhost",
  "pathname": "/product",
  "search": "",
  "hash": "",
  "pageKey": "/product",
  "environment": "localhost",
  "viewport": {
    "width": 1440,
    "height": 900,
    "scrollX": 0,
    "scrollY": 120
  }
}
```

### AnchorPayload

```json
{
  "selector": "main button.primary",
  "xpath": "/html/body/main/button[1]",
  "domPath": ["HTML", "BODY", "MAIN", "BUTTON"],
  "textContent": "Start trial",
  "textOffset": 0,
  "elementRect": {
    "x": 120,
    "y": 340,
    "width": 160,
    "height": 44
  },
  "clickOffset": {
    "xRatio": 0.5,
    "yRatio": 0.5
  },
  "viewport": {
    "width": 1440,
    "height": 900,
    "scrollX": 0,
    "scrollY": 120
  }
}
```

## 4. Endpoints

### POST /workspaces

Create a workspace.

Request:

```json
{
  "name": "Acme Team"
}
```

Response:

```json
{
  "id": "workspace_id",
  "name": "Acme Team",
  "role": "admin"
}
```

### GET /workspaces

List workspaces for current user.

Response:

```json
{
  "workspaces": [
    {
      "id": "workspace_id",
      "name": "Acme Team",
      "role": "admin"
    }
  ]
}
```

### POST /projects

Create a project.

Request:

```json
{
  "workspaceId": "workspace_id",
  "name": "Marketing Website",
  "allowedDomains": ["example.com", "staging.example.com", "localhost"]
}
```

Response:

```json
{
  "id": "project_id",
  "workspaceId": "workspace_id",
  "name": "Marketing Website"
}
```

### POST /sessions

Create a review session.

Request:

```json
{
  "projectId": "project_id",
  "name": "Sprint 12 Review",
  "defaultEnvironment": "localhost",
  "initialPage": {
    "url": "http://localhost:3000/product",
    "title": "Product",
    "hostname": "localhost",
    "pathname": "/product",
    "pageKey": "/product"
  }
}
```

Response:

```json
{
  "id": "session_id",
  "projectId": "project_id",
  "name": "Sprint 12 Review",
  "status": "active",
  "shareUrl": "https://app.webcomment.app/review/session_id"
}
```

### GET /sessions/match

Find sessions matching the current page context.

Query:

```text
?workspaceId=workspace_id&pageKey=/product&hostname=localhost
```

Response:

```json
{
  "sessions": [
    {
      "id": "session_id",
      "projectId": "project_id",
      "projectName": "Marketing Website",
      "name": "Sprint 12 Review",
      "openThreadCount": 4,
      "updatedAt": "2026-06-18T07:00:00Z"
    }
  ]
}
```

### GET /sessions/:sessionId

Get session details.

Response:

```json
{
  "id": "session_id",
  "name": "Sprint 12 Review",
  "status": "active",
  "project": {
    "id": "project_id",
    "name": "Marketing Website"
  },
  "permissions": {
    "canComment": true,
    "canResolve": true,
    "canManage": false
  }
}
```

### POST /pins

Create a pin, thread, and first comment.

Request:

```json
{
  "sessionId": "session_id",
  "page": {
    "url": "http://localhost:3000/product",
    "title": "Product",
    "hostname": "localhost",
    "pathname": "/product",
    "pageKey": "/product",
    "environment": "localhost"
  },
  "anchor": {
    "selector": "main button.primary",
    "xpath": "/html/body/main/button[1]",
    "textContent": "Start trial",
    "clickOffset": {
      "xRatio": 0.5,
      "yRatio": 0.5
    }
  },
  "comment": {
    "body": "This CTA should use the new copy."
  }
}
```

Response:

```json
{
  "pin": {
    "id": "pin_id",
    "status": "attached"
  },
  "thread": {
    "id": "thread_id",
    "status": "open"
  },
  "comment": {
    "id": "comment_id",
    "body": "This CTA should use the new copy."
  }
}
```

### GET /comments

Get comments for a session or page.

Query:

```text
?sessionId=session_id&pageKey=/product&includeResolved=false
```

Response:

```json
{
  "pages": [
    {
      "id": "page_id",
      "pageKey": "/product",
      "pins": [
        {
          "id": "pin_id",
          "anchor": {},
          "status": "attached",
          "thread": {
            "id": "thread_id",
            "status": "open",
            "comments": []
          }
        }
      ]
    }
  ]
}
```

### PATCH /pins/:pinId/anchor

Reposition an existing pin without changing its thread or comments.

Request:

```json
{
  "expectedRevision": 1,
  "anchor": {
    "mode": "element",
    "selector": "main section:nth-child(2)",
    "xpath": "/html/body/main/section[2]",
    "domPath": ["HTML", "BODY", "MAIN", "SECTION"],
    "textContent": "Pricing",
    "documentPosition": { "x": 640, "y": 920 },
    "viewportPosition": { "x": 640, "y": 420 },
    "clickOffset": { "xRatio": 0.8, "yRatio": 0.35 },
    "viewport": { "width": 1440, "height": 900, "scrollX": 0, "scrollY": 500 }
  }
}
```

Response:

```json
{
  "id": "pin_id",
  "anchor": {},
  "anchorRevision": 2,
  "movedBy": "user_id",
  "movedAt": "2026-06-18T09:30:00Z"
}
```

Rules:

- Allowed for the comment author, Editor, or Admin.
- Return `409 anchor_revision_conflict` when `expectedRevision` is stale.
- Publish `PIN_ANCHOR_UPDATED` only after persistence succeeds.

### POST /replies

Add a reply to a thread.

Request:

```json
{
  "threadId": "thread_id",
  "body": "Updated in the latest build."
}
```

Response:

```json
{
  "id": "comment_id",
  "threadId": "thread_id",
  "body": "Updated in the latest build.",
  "createdAt": "2026-06-18T07:00:00Z"
}
```

### PATCH /threads/:threadId/resolve

Resolve a thread.

Request:

```json
{
  "resolved": true
}
```

Response:

```json
{
  "id": "thread_id",
  "status": "resolved",
  "resolvedAt": "2026-06-18T07:00:00Z"
}
```

### POST /share-links

Create or rotate a review link.

Request:

```json
{
  "sessionId": "session_id",
  "accessMode": "link_with_login"
}
```

Response:

```json
{
  "url": "https://app.webcomment.app/review/session_id?token=token",
  "accessMode": "link_with_login"
}
```

## 5. Realtime Events

Subscribe to:

```text
session:{sessionId}
```

Events:

| Event | Payload |
| --- | --- |
| `USER_JOINED` | User id, display name, page key. |
| `USER_LEFT` | User id. |
| `PIN_CREATED` | Pin, thread, first comment. |
| `COMMENT_CREATED` | Thread id and comment. |
| `THREAD_RESOLVED` | Thread id, resolver, timestamp. |
| `THREAD_REOPENED` | Thread id, user, timestamp. |
| `PIN_ANCHOR_UPDATED` | Pin id, anchor status, strategy. |

## 6. Error Format

```json
{
  "error": {
    "code": "permission_denied",
    "message": "You do not have permission to comment in this session.",
    "requestId": "req_123"
  }
}
```

Common codes:

- `unauthorized`
- `permission_denied`
- `not_found`
- `validation_error`
- `rate_limited`
- `anchor_invalid`
- `session_archived`

## 7. Rate Limits

Recommended MVP limits:

- Create pin: 60 per minute per user.
- Reply: 120 per minute per user.
- Match sessions: 300 per minute per user.
- Share link creation: 20 per hour per session.
