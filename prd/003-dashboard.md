# PRD 003: Dashboard UI

## Summary

The DevTrack web dashboard. A real-time view of all tracked projects, their SDLC/content pipeline state, PR queue, and cross-project activity timeline. Built with Next.js, consumes the API from PRD 001.

## Problem

Even with the API aggregating state, you need a way to see it all at a glance. The dashboard is the "mission control" view that answers: what needs me right now, what's in flight, what shipped, and what's stalled.

## Pages

### Dashboard (Home - `/`)

A grid of project cards. This is the "what needs me" view.

**Each card shows:**
- Project name (bold) + domain badge (colored pill per domain)
- Workflow type label (sdlc / content)
- Current state summary — one-liner from active PRD or content pipeline status
  - SDLC: "Adding barcode scanning — 3/5 items done"
  - Content: "2 drafts in progress, 5 ideas queued"
- Tags as small muted pills
- Activity pulse:
  - Glowing green border/ring: active in last hour
  - Solid green dot: active today
  - Yellow dot: active this week
  - Gray: stale (no activity this week)
- Action needed badge: red indicator if open PR awaiting review, stalled branch, or failing checks

**Top bar:**
- Filter chips: by domain, workflow type, tag
- Sort: by last activity, by name, by "needs attention first"
- Search box
- Count summary: "12 projects — 3 need attention — 2 PRs open"

**Behavior:**
- Cards with active work visually pop (brighter, subtle glow animation)
- Stale cards fade to background
- Real-time updates via SWR polling (revalidate every 30s)
- Click a card to navigate to its project summary page

### Project Summary (`/projects/[slug]`)

The "PDP" for a single project. Everything about this project in one place.

**Header:**
- Project name, domain badge, workflow type, tags
- Repo link (GitHub icon), deploy URL (external link icon) if applicable
- Health indicators: days since last activity, open PR count, check status

**Current Work section (prominent, top of page):**
- Active PRD card: title, summary, progress bar with "3/5 work items done"
- Work item list with status indicators (done/in-progress/todo)
- Current branch name + PR status with link to GitHub PR
- Recent commits (last 5, relative timestamps)

**Pipeline section:**

For SDLC:
- **Up Next:** Queued PRDs not yet started (title + summary)
- **Shipped:** Completed PRDs with dates (collapsible, most recent first)

For Content:
- **Ideas:** Backlog items (title + summary, sortable)
- **Drafts:** In-progress drafts with status
- **Published:** Recent published items with dates

**Activity Timeline:**
- Vertical timeline feed of all project events
- Each event: icon, relative timestamp, description
- Filterable by event type
- Paginated or infinite scroll

### PR Queue (`/prs`)

All open PRs across all tracked projects in one unified list.

**Each row:**
- Project name + domain badge
- PR title (linked to GitHub)
- Branch name
- Status: draft, open, reviewed, changes requested, approved
- Age with color coding: green (<1 day), yellow (1-3 days), red (>3 days)
- Check status (passing/failing indicator)
- Author

**Sortable by:** age, project, status
**Filterable by:** domain, project

### Timeline (`/timeline`)

Cross-project chronological activity feed. Built for standups and daily recaps.

**Grouped by day** with date headers ("Today", "Yesterday", "Monday, March 13").

**Each entry:**
- Timestamp
- Project name + domain badge (compact, inline)
- Event icon (git commit, PR, deploy, PRD update, content publish, etc.)
- Event description ("Merged PR #42: Add batch picking mode")

**Day summary card at top of each group:**
"5 commits across 3 projects, 1 PR merged, 1 draft started"

**Filters:**
- Date range: today, yesterday, this week, custom
- By project
- By domain
- By event type

## Design

**Dark theme by default.** Clean, minimal. The data is dense so the chrome needs to be quiet.

**Domain colors** (consistent everywhere):
- arcanelayer: purple
- aiteam: blue
- joshowensdev: green
- infrastructure: orange
- wendyowensbooks: pink
- Other domains get auto-assigned from a palette

**Activity pulse animation:**
- "Active now" cards get a subtle breathing glow on their border
- Should feel alive without being distracting
- CSS animation, not JS

**Responsive:** Desktop-first but usable on tablet/phone for quick checks.

## Navigation

Persistent left sidebar:
- DevTrack logo/wordmark
- Dashboard (home icon)
- Timeline (clock icon)
- PR Queue (git-pull-request icon) with count badge for open PRs
- Divider
- Projects list grouped by domain, each clickable to summary page
- Bottom: settings gear

Sidebar collapses to icons on smaller screens.

## Data Fetching

- SWR for all data fetching with 30-second revalidation
- reactiveSWR for real-time feel without WebSocket complexity
- Optimistic UI updates where possible (marking items, status changes)

## Non-Goals (this PRD)

- Settings/admin pages (future)
- User auth / login (single-user, API key only for now)
- Mobile app
- Push notifications
- Light theme (future, maybe)
