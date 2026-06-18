# Go To Market

## 1. Positioning

WebComment is the collaboration layer for reviewing real websites.

Short positioning:

> Comment directly on any website, staging app, or localhost page with your team.

Long positioning:

> WebComment brings Figma-style comments to live websites, staging builds, and local development. Teams can click on the page, discuss in context, resolve feedback, and share review sessions without screenshots or scattered chat threads.

## 2. Target Segments

### Primary MVP Segment

Product teams building web products:

- Product designers
- Frontend engineers
- Product managers
- Small SaaS teams
- Startup product teams

Why:

- They review live/staging pages frequently.
- They already understand Figma comments.
- They feel the pain of screenshots and scattered Slack messages.

### Secondary Segment

Web agencies:

- Client website review
- Staging feedback
- Acceptance rounds

Likely V2 because guest access, white labeling, and client permissions matter more.

### Future Segment

QA and support teams:

- Bug reports
- Browser metadata
- Issue tracker integrations

Likely V2/V3 because it shifts the product toward Marker.io territory.

## 3. Core Messaging

### Tagline Options

- Figma-style comments for any website.
- Review live websites without screenshots.
- Turn any webpage into a collaborative review session.

### Value Propositions

For designers:

- Leave precise feedback directly on the real page.

For engineers:

- See exactly where feedback belongs.

For PMs:

- Keep review decisions in one session.

For teams:

- Discuss, reply, resolve, and share without context switching.

## 4. Differentiation

| Competitor | Strength | WebComment Angle |
| --- | --- | --- |
| Figma Comment | Excellent design collaboration | WebComment works on real websites and localhost. |
| Marker.io | Bug report metadata and integrations | WebComment starts with collaborative review, not ticket creation. |
| Pastel | Website feedback and client review | WebComment focuses on Chrome extension speed, realtime collaboration, and stable anchoring. |

## 5. MVP Launch Strategy

### Phase 1: Private Alpha

Audience:

- 5 to 10 friendly product teams.
- Teams reviewing staging/local web apps weekly.

Goal:

- Validate comment creation, pin accuracy, thread discussion, and localhost support.

Success:

- Each team completes at least one real review session.
- Anchor recovery issues are documented and reduced.

### Phase 2: Private Beta

Audience:

- 30 to 50 teams.
- Product teams and small agencies.

Goal:

- Validate sharing, realtime collaboration, and session reuse.

Success:

- 40% of sessions have resolved comments.
- 30% of sessions involve more than one collaborator.

### Phase 3: Public Chrome Web Store Launch

Requirements:

- Stable extension permissions.
- Privacy policy.
- Terms of service.
- Store screenshots.
- 128px icon.
- Onboarding page.
- Help docs for localhost and staging usage.

## 6. Acquisition Channels

MVP channels:

- Product Hunt launch.
- Designer and frontend communities.
- Indie Hackers / Hacker News launch post.
- SEO pages for "comment on website", "website feedback tool", "Figma comments for websites".
- Chrome Web Store search.
- Founder-led outreach to product teams.

Content ideas:

- How to review localhost with your team.
- Why screenshots are a slow way to review UI.
- Figma comments for live websites.
- Website review checklist for product teams.

## 7. Pricing Strategy

### Free

For individual exploration.

- 1 workspace
- 1 project
- 3 active review sessions
- Limited collaborators

### Pro

For individual designers or engineers.

- Unlimited sessions
- More collaborators
- Review link sharing
- Session archive

### Team

For product teams.

- Roles and permissions
- Team members
- Analytics
- Priority support

### Agency

For client review.

- Multiple client workspaces
- Guest review
- White label, V2/V3

### Enterprise

For larger teams.

- SSO
- Advanced permissions
- Security review
- Custom retention

## 8. Activation Moment

The activation moment is:

> A user creates a pin on a real website and another collaborator sees or replies to it.

Product onboarding should optimize for reaching this moment quickly.

## 9. Onboarding Copy

Suggested first-run flow:

1. `Choose a workspace`
2. `Create a review session`
3. `Open any website or localhost`
4. `Click Comment to leave your first note`
5. `Share the review link with your team`

Permission explanation:

> WebComment needs access to the page you choose so it can place comment pins and attach them to the right location. We only activate after you select a session or start commenting.

## 10. Launch Assets

Needed before public launch:

- Landing page
- Chrome Web Store listing
- Product screenshots
- Short demo video
- Privacy policy
- Terms of service
- Help center article: using localhost
- Help center article: inviting collaborators
- Help center article: anchor recovery and lost pins

## 11. Sales Discovery Questions

Use during alpha/beta interviews:

- How do you currently review staging or production UI?
- Where does feedback get lost?
- How often do screenshots fail to explain the issue?
- Who needs to participate in review sessions?
- Do reviewers need accountless guest access?
- How important is localhost review?
- What would make this replace your current workflow?

## 12. Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Users compare directly with bug reporting tools | Keep messaging centered on collaboration and review. |
| Chrome permissions reduce install trust | Provide clear disclosure and activate only by user action. |
| Guest review becomes expected immediately | Decide early whether guest access is MVP or V2. |
| Anchor quality is not reliable enough | Track anchor recovery metrics and prioritize recovery work. |
| Teams need integrations before adopting | Use integrations as V2 conversion features, not MVP blockers. |
