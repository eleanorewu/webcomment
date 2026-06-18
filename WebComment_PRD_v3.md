# WebComment PRD v3.0

## Product Vision
Collaborate directly on websites.

讓任何網站都擁有 Figma 等級的協作能力。

---

# Executive Summary

WebComment 是一套 Website Collaboration Layer。

不同於 Figma 僅能評論設計稿，也不同於 Marker.io 偏向 Bug 回報，WebComment 專注於讓團隊直接在真實網頁上進行協作、評論、驗收與決策。

核心價值：

- Direct Website Collaboration
- Realtime Discussion
- Stable Comment Anchoring
- Review Session Management

---

# Product Strategy

## Market Position

Figma → Design Collaboration

Pastel → Website Review

Marker.io → Bug Reporting

WebComment → Website Collaboration Layer

---

# Product Principles

## Principle 1

評論必須永遠附著在正確位置。

錯位比遺失更危險。

## Principle 2

評論屬於 Review Session。

不是屬於 URL。

## Principle 3

協作優先於回報。

---

# JTBD

## Job 1

當我正在 Review 網頁時，

我想直接點擊畫面留下意見，

因此不需要截圖與來回溝通。

## Job 2

當工程師收到修改需求時，

我想直接看到問題位置，

因此能快速修正。

## Job 3

當團隊協作時，

我希望所有討論集中於同一位置。

---

# Personas

## Product Designer

目標：收集設計回饋

## Frontend Engineer

目標：快速修正問題

## Product Manager

目標：集中管理 Review

## QA（V2）

目標：回報與追蹤 Bug

## Client（V2）

目標：驗收與提出意見

---

# Core Domain Model

Workspace
└── Project
    └── Review Session
        └── Page Snapshot
            └── Pin
                └── Thread
                    └── Reply

---

# Review Session Model

Review Session 為產品核心。

例如：

Petlove Redesign
Sprint 12 Review

每個 Session 擁有獨立評論與權限。

---

# Pin Anchoring Architecture

## Hybrid Anchoring System

保存：

- URL
- Selector
- XPath
- DOM Path
- Text Content
- Offset Position
- Viewport

---

# Anchor Recovery Strategy

Tier 1

CSS Selector

Tier 2

XPath

Tier 3

Text Recovery

Tier 4

DOM Similarity Match

Tier 5

Lost Pin

Comment location unavailable

---

# Page Identity Model

Page 不等於 URL。

PageFingerprint：

- hostname
- pathname
- domHash
- appVersion

---

# Localhost Strategy

評論不綁定 localhost URL。

評論綁定：

- Review Session
- Page Key

例如：

/product

/team

/settings

---

# Information Architecture

Workspace

├── Projects
├── Review Sessions
├── Members
├── Comments
└── Settings

---

# UX Flow

Open Website

→ Open Extension

→ Enter Comment Mode

→ Click Element

→ Create Comment

→ Team Discussion

→ Resolve

→ Archive

---

# Permission Matrix

Viewer

- View

Commenter

- View
- Comment

Editor

- View
- Comment
- Resolve

Admin

- Full Access

---

# Chrome Extension Architecture

Extension

├── Popup
├── Content Script
├── Background Worker
├── Overlay Layer
└── Shared UI

---

# Overlay Layer

Overlay Root

├── Pins
├── Toolbar
├── Thread Drawer
└── Notification Layer

---

# Supabase ERD

workspaces

projects

review_sessions

pages

pins

threads

comments

replies

users

members

---

# API Contract

POST /sessions

POST /pins

POST /comments

POST /replies

PATCH /resolve

GET /comments

---

# Realtime Architecture

Workspace Channel

Review Session Channel

Comment Channel

Events

- PIN_CREATED
- COMMENT_CREATED
- REPLY_CREATED
- COMMENT_RESOLVED
- USER_JOINED

---

# Event Tracking Plan

extension_opened

session_created

comment_created

reply_created

comment_resolved

share_link_clicked

---

# Empty States

No Comments Yet

Click anywhere to start discussion.

---

# Error States

Connection Lost

Permission Denied

Comment Save Failed

Anchor Recovery Failed

---

# Edge Cases

Responsive Layout

Deleted Element

Dynamic DOM

SPA Route Change

Multiple Tabs

A/B Testing

Authentication State Change

---

# Monetization Strategy

Free

Pro

Team

Agency

Enterprise

---

# Pricing Model

Free

- 1 Workspace
- 3 Sessions

Pro

- Unlimited Sessions
- Mentions
- Notifications

Team

- Roles
- Analytics

Agency

- Multi Client
- White Label

---

# Chrome Web Store Requirements

Manifest V3

Privacy Policy

Terms of Service

128px Icon

Store Screenshots

Permission Disclosure

---

# Success Metrics

North Star Metric

Resolved Comments per Review Session

Supporting Metrics

- WAU
- MAU
- Comments per Session
- Resolve Rate
- Anchor Recovery Rate

Target

Anchor Recovery Rate > 95%

---

# Roadmap

V1

- Comment
- Pin
- Reply
- Resolve
- Realtime
- Review Session

V2

- Mention
- Screenshot
- Browser Metadata
- Public Review Portal

V3

- Jira Integration
- Slack Integration
- Widget Mode

V4

- AI Summary
- AI Prioritization
- AI Categorization
