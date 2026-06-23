# Guest Review Session Design

## Goal

Create a private web comment space that users can start and share without registering an account.

The first version of collaborative access is based on a password-protected Review Session, not on user accounts. People who have the invite link, the session password, and a display name can view, create, and reply to comments inside that session. People on the same URL without valid session access cannot see those comments.

## Product Principle

WebComment comments do not belong to a public URL channel. They belong to a Review Session.

Multiple Review Sessions may point to the same URL, but their pins, threads, replies, and participants remain isolated by session_id and access credentials.

## Safety Principle

WebComment is not a browsing tracker. It only activates for an explicit review session and stores the minimum page metadata required to place, recover, and synchronize user-created comments.

This principle affects product copy, extension permissions, storage, API design, privacy policy, and Chrome Web Store review readiness.

## In Scope

- Account-free Review Session creation.
- Session password for guest access.
- Invite link for collaborators.
- Display name entry for guests.
- Session-scoped guest identity.
- Owner/admin capability through a locally stored owner token and one-time admin link.
- Comment visibility enforced by Review Session access, not URL alone.
- Owner controls for password rotation, session closure, guest removal, comment deletion, and invite link reset.
- Risk controls for Chrome Extension review, privacy disclosure, and data minimization.

## Out of Scope

- Formal workspace member accounts.
- Email verification.
- OAuth login.
- Billing, teams, or organization administration.
- Enterprise-grade audit logs.
- Recovery flow for a lost owner token.
- Public URL-wide comment feeds.
- Full-page screenshots, full-page HTML capture, cookies, local storage, password fields, or sensitive form values.

## Roles

### Owner

The Owner is the person who creates the Review Session and receives the owner/admin capability.

The Owner is not a registered account in this MVP. Ownership is proven by possession of owner_token.

Owner capabilities:

- Open the session as an admin.
- Change the session password.
- Close the session.
- Delete comments or replies.
- Remove a guest identity.
- Reset the invite link.
- Continue commenting and replying like a guest.

If the Owner loses the owner token or admin link, the MVP does not provide account-based recovery.

### Guest

A Guest is anyone who enters through the invite link, passes the session password check, and provides a display name.

Guest capabilities:

- View pins, threads, and replies in the session.
- Create comments.
- Reply to threads.
- Continue under the same guest identity in the same browser while the guest token remains available.

Guest limitations:

- No workspace membership.
- No account identity.
- No email verification.
- No ability to recover identity across browsers or devices.
- No ability to manage session access.

## Access Model

Review Session access is represented by opaque tokens:

- owner_token: high-privilege token for session administration.
- guest_token: scoped token for viewing, commenting, and replying in one Review Session.

Tokens are authorization capabilities. Anyone holding a valid token has the token's privileges, so the UI must communicate that owner/admin links should be stored carefully.

## Creation Flow

1. User opens a target webpage.
2. User opens WebComment.
3. User selects Create Review Session.
4. User enters a session name and password.
5. Backend creates the session and stores only a password hash.
6. Backend returns:
   - invite_link for collaborators.
   - admin_link or owner_token for the creator.
7. Extension stores the owner token locally for the current browser profile.
8. Owner enters the session and can start commenting.

## Guest Join Flow

1. Guest opens an invite link.
2. If the extension is installed, WebComment opens or activates the target page with the pending session.
3. If the extension is missing, WebComment shows an install or access instruction page.
4. Guest enters the session password.
5. Guest enters a display name.
6. Backend verifies the password hash and creates a session-scoped guest identity.
7. Backend returns a guest token.
8. Extension stores the guest token locally for the current browser profile.
9. Guest can see and participate in that session's comments.

## Comment Visibility Rule

The backend must never return comments based on URL alone.

Every read or realtime subscription must be scoped by:

- Valid session id.
- Valid owner or guest access token.
- Page identity that matches the session's page matching rules.

The same URL can have multiple private sessions. A user on the same URL sees only the sessions they explicitly entered.

## Data Model Additions

### review_sessions

- id
- name
- status: active or closed
- password_hash
- invite_secret_hash
- owner_token_hash
- created_at
- updated_at
- closed_at

### session_guests

- id
- session_id
- display_name
- token_hash
- status: active or removed
- created_at
- last_seen_at

### session_access_events

This table is deferred from the MVP. The schema is listed here so the implementation does not block a later access-event history.

- id
- session_id
- actor_type: owner or guest
- actor_id
- event_type
- created_at

No IP address, full user agent, or detailed browsing history should be stored unless needed for abuse prevention and disclosed in the privacy policy.

## Extension Activation

WebComment should activate only after explicit user intent:

- Opening the extension popup.
- Opening an invite or admin link.
- Selecting a known active session from the extension.

The extension should not silently scan browsing activity in the background to discover pages to upload.

## Permission Strategy

Use the narrowest practical Chrome permissions for the MVP.

Preferred behavior:

- Use active-tab or user-triggered activation where possible.
- Inject the overlay only into the page where the user starts or joins a Review Session.
- Request broader host access only when required for the user-facing annotation feature.
- Explain any host permission in product UI and Chrome Web Store listing.

Avoid:

- Future-proof permissions for unbuilt features.
- Background collection of visited URLs.
- Reading cookies, local storage, password fields, or unrelated form data.
- Full-page screenshot or full DOM capture by default.

## Stored Page Metadata

Store only data required to place, recover, and synchronize user-created comments:

- URL or normalized page identity.
- Session id.
- Project-independent page key when needed for localhost and staging matching.
- CSS selector.
- XPath.
- DOM path.
- Text context near the anchor.
- Element rect.
- Click offset ratio.
- Viewport and scroll position.
- Anchor mode and revision.

Do not store:

- Cookies.
- Passwords.
- Access tokens from the host website.
- Full local storage.
- Full page HTML.
- Sensitive input values.
- Unrelated browsing history.

## Security Requirements

- Session passwords are never stored in plaintext.
- Owner and guest tokens are stored server-side only as hashes.
- All API requests use HTTPS.
- Realtime connections use secure WebSocket transport.
- Tokens are revocable.
- Resetting the invite link invalidates previous invite links for future joins.
- Existing active guest tokens remain valid after invite reset unless the owner removes the guest, changes session status, or rotates access policy in a later version.
- Changing the session password affects future joins. Existing active guest tokens remain valid unless the owner removes the guest.
- Removing a guest invalidates that guest token.
- Closing a session prevents new guest access and disables comment writes.
- Existing comments in a closed session remain readable to valid owner and guest tokens, but only the owner can perform management actions.

## Chrome Web Store Review Risks

The main review risk is not account-free collaboration. The main risk is appearing to collect browsing activity or page content beyond the stated user-facing annotation purpose.

Risk controls:

- Chrome Web Store listing clearly says WebComment lets invited collaborators annotate webpages inside private Review Sessions.
- Privacy policy clearly lists collected data: display name, comments, replies, URL/page identity, anchor metadata, session access tokens, and basic operational logs.
- Privacy policy clearly states data is used only to provide comment placement, recovery, collaboration, synchronization, access control, support, and abuse prevention.
- Privacy policy states WebComment does not sell user data or use browsing data for advertising.
- In-product UI explains that pins and comments are stored in the selected Review Session.
- No silent background browsing tracker behavior.
- No full-page capture by default.
- No hidden remote code execution.
- Permission requests are tied to visible user actions.

## Error Handling

### Wrong Password

Show a clear error and keep the guest on the join screen. Do not reveal whether the session id or invite link is valid beyond what is necessary.

### Closed Session

Show that the session is closed and no new comments can be added. Closed is final for the MVP.

### Removed Guest

Invalidate local guest token and show that access has been removed.

### Lost Owner Token

Explain that management access cannot be recovered in the account-free MVP. The user may still create a new Review Session.

### Invite Link Reset

Old invite links stop working for future joins. Existing active guests remain active unless the owner removes them.

## Acceptance Criteria

- A user can create a Review Session without registering an account.
- Creator receives owner access and can copy an invite link.
- Guest can join with invite link, password, and display name.
- Guest can view, create, and reply to comments in the session.
- User on the same URL without valid session access cannot fetch or subscribe to comments.
- Same URL can have multiple isolated Review Sessions.
- Owner can change the password.
- Owner can close the session.
- Owner can reset invite access.
- Owner can remove a guest.
- Owner can delete comments or replies.
- Comment reads and realtime events are scoped to session access.
- Extension activation requires explicit user intent.
- Stored metadata is limited to comment anchoring and synchronization needs.
- Privacy and permission copy is aligned with the actual implementation.

## Testing Expectations

Automated tests should cover:

- Session password verification.
- Guest token creation and rejection.
- Owner token authorization.
- Comment read isolation across two sessions on the same URL.
- Comment write rejection without valid session access.
- Guest removal token invalidation.
- Invite reset behavior.
- Closed session write rejection.
- Page matching with session id and page identity.

Manual verification should cover:

- A and B join the same session and see each other's comments.
- C opens the same URL without the session and sees no private comments.
- C creates a separate session on the same URL and sees only C's session comments.
- Owner changes password and verifies new guests need the new password.
- Owner removes a guest and verifies that guest loses access.
- Extension does not show or upload comments before explicit session activation.

## Product Copy Guidance

Recommended short positioning:

> Create a private review session on any webpage. Share a password-protected link so collaborators can leave comments without creating an account.

Recommended privacy-facing copy:

> WebComment only stores the comments you create and the minimum page metadata needed to place those comments back on the page. It does not track your browsing history or collect page content outside active review sessions.

## Future Upgrade Path

This design should not block future account-based collaboration.

Later versions can add:

- Member accounts.
- Workspaces.
- Email invites.
- OAuth login.
- Session recovery.
- Per-user audit logs.
- Persistent cross-device identity.
- More granular roles such as Viewer, Commenter, Editor, and Admin.

The MVP guest session model can migrate into the future account model by linking historical guest identities to registered users when users choose to claim them.
