export type Domain = "arcanelayer" | "aiteam" | "joshowensdev" | "infrastructure" | "wendyowensbooks"
export type WorkflowType = "sdlc" | "content"
export type ActivityLevel = "active-now" | "today" | "this-week" | "stale"
export type PRStatus = "draft" | "open" | "reviewed" | "changes-requested" | "approved" | "merged"
export type CheckStatus = "passing" | "failing" | "pending"
export type EventType = "commit" | "branch" | "pr-opened" | "pr-reviewed" | "pr-merged" | "prd-update" | "deploy" | "published" | "draft-started"

export interface WorkItem {
  id: string
  title: string
  status: "done" | "in-progress" | "todo"
}

export interface PRD {
  id: string
  title: string
  summary: string
  status: "active" | "queued" | "shipped"
  workItems: WorkItem[]
  completedAt?: string
}

export interface PullRequest {
  id: string
  projectSlug: string
  number: number
  title: string
  branch: string
  status: PRStatus
  checkStatus: CheckStatus
  createdAt: string
  url: string
  author: string
  unresolvedComments: number
}

export interface Commit {
  sha: string
  message: string
  timestamp: string
}

export interface Draft {
  id: string
  title: string
  status: "draft" | "review"
}

export interface ContentIdea {
  id: string
  title: string
  summary: string
}

export interface PublishedPost {
  id: string
  title: string
  publishedAt: string
  url: string
}

export interface TimelineEvent {
  id: string
  projectSlug: string
  type: EventType
  description: string
  timestamp: string
  metadata?: Record<string, string>
}

export interface Project {
  slug: string
  name: string
  domain: Domain
  workflow: WorkflowType
  tags: string[]
  activityLevel: ActivityLevel
  repoUrl: string
  deployUrl?: string
  openPRCount: number
  checkStatus: CheckStatus
  daysSinceActivity: number
  // SDLC specific
  activePRD?: PRD
  upNextPRDs?: PRD[]
  shippedPRDs?: PRD[]
  currentBranch?: string
  currentPR?: PullRequest
  recentCommits?: Commit[]
  // Content specific
  drafts?: Draft[]
  ideas?: ContentIdea[]
  published?: PublishedPost[]
  // For dashboard summary
  summaryLine: string
}

const now = new Date()

function hoursAgo(h: number) {
  return new Date(now.getTime() - h * 60 * 60 * 1000).toISOString()
}
function daysAgo(d: number) {
  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
}

export const PROJECTS: Project[] = [
  {
    slug: "picking-app",
    name: "picking-app",
    domain: "arcanelayer",
    workflow: "sdlc",
    tags: ["warehouse", "mobile", "scanner"],
    activityLevel: "today",
    repoUrl: "https://github.com/arcanelayer/picking-app",
    deployUrl: "https://picking.arcanelayer.com",
    openPRCount: 1,
    checkStatus: "passing",
    daysSinceActivity: 0,
    summaryLine: "Adding barcode scanning — 3/5 items done",
    activePRD: {
      id: "prd-1",
      title: "Barcode scanning support",
      summary: "Integrate native barcode scanner into the picking workflow for faster item confirmation.",
      status: "active",
      workItems: [
        { id: "wi-1", title: "Camera permission handling", status: "done" },
        { id: "wi-2", title: "Barcode decoder library integration", status: "done" },
        { id: "wi-3", title: "Scan-to-confirm UX flow", status: "done" },
        { id: "wi-4", title: "Multi-barcode batch mode", status: "in-progress" },
        { id: "wi-5", title: "Offline scan queue + sync", status: "todo" },
      ],
    },
    upNextPRDs: [
      {
        id: "prd-2",
        title: "Batch picking optimization",
        summary: "Allow pickers to handle multiple orders simultaneously with smart routing.",
        status: "queued",
        workItems: [],
      },
    ],
    shippedPRDs: [
      {
        id: "prd-0",
        title: "Pick list filtering",
        summary: "Filter pick lists by zone, priority, and item type.",
        status: "shipped",
        workItems: [],
        completedAt: daysAgo(14),
      },
    ],
    currentBranch: "feature/barcode-scanning",
    currentPR: {
      id: "pr-1",
      projectSlug: "picking-app",
      number: 47,
      title: "feat: barcode scanner integration",
      branch: "feature/barcode-scanning",
      status: "open",
      checkStatus: "passing",
      createdAt: hoursAgo(6),
      url: "https://github.com/arcanelayer/picking-app/pull/47",
      author: "joshowens",
      unresolvedComments: 3,
    },
    recentCommits: [
      { sha: "a3f92c1", message: "add multi-barcode batch scan mode (WIP)", timestamp: hoursAgo(2) },
      { sha: "b1e4d78", message: "fix: camera permission dialog on Android", timestamp: hoursAgo(5) },
      { sha: "c9a02f3", message: "feat: scan-to-confirm UX flow", timestamp: hoursAgo(8) },
      { sha: "d5b71e9", message: "chore: integrate @zxing/browser decoder", timestamp: daysAgo(1) },
      { sha: "e8c34a0", message: "feat: camera permission handling", timestamp: daysAgo(2) },
    ],
  },
  {
    slug: "k8s-infra",
    name: "k8s-infra",
    domain: "infrastructure",
    workflow: "sdlc",
    tags: ["kubernetes", "networking", "cilium"],
    activityLevel: "this-week",
    repoUrl: "https://github.com/arcanelayer/k8s-infra",
    openPRCount: 0,
    checkStatus: "passing",
    daysSinceActivity: 3,
    summaryLine: "Migrating to Cilium CNI — 1/3 items done",
    activePRD: {
      id: "prd-3",
      title: "Migrate to Cilium CNI",
      summary: "Replace Flannel with Cilium for eBPF-based networking, better observability, and network policy enforcement.",
      status: "active",
      workItems: [
        { id: "wi-6", title: "Cilium install + cluster validation in staging", status: "done" },
        { id: "wi-7", title: "Network policy migration from Flannel rules", status: "in-progress" },
        { id: "wi-8", title: "Production cutover + Hubble observability setup", status: "todo" },
      ],
    },
    upNextPRDs: [
      {
        id: "prd-4",
        title: "Autoscaling improvements",
        summary: "Tune HPA and VPA policies across all workloads with custom metrics.",
        status: "queued",
        workItems: [],
      },
    ],
    shippedPRDs: [
      {
        id: "prd-00",
        title: "Upgrade to K8s 1.29",
        summary: "Cluster upgrade with zero-downtime node rotation strategy.",
        status: "shipped",
        workItems: [],
        completedAt: daysAgo(21),
      },
    ],
    currentBranch: "feat/cilium-migration",
    recentCommits: [
      { sha: "f2a8b4c", message: "wip: network policy manifest migration", timestamp: daysAgo(3) },
      { sha: "g7d19e2", message: "docs: Cilium staging validation notes", timestamp: daysAgo(4) },
      { sha: "h4c62f0", message: "feat: Cilium install complete on staging", timestamp: daysAgo(5) },
      { sha: "i9e37a1", message: "chore: remove old Flannel DaemonSet", timestamp: daysAgo(6) },
      { sha: "j1b84d3", message: "init: Cilium migration plan", timestamp: daysAgo(7) },
    ],
  },
  {
    slug: "joshowens-dev",
    name: "joshowens-dev",
    domain: "joshowensdev",
    workflow: "content",
    tags: ["blog", "nextjs", "writing"],
    activityLevel: "today",
    repoUrl: "https://github.com/joshowens/joshowens.dev",
    deployUrl: "https://joshowens.dev",
    openPRCount: 0,
    checkStatus: "passing",
    daysSinceActivity: 0,
    summaryLine: "2 drafts in progress, 5 ideas queued",
    drafts: [
      { id: "d-1", title: "How I Use Claude Code in My Daily Workflow", status: "draft" },
      { id: "d-2", title: "Building a Kubernetes Home Lab in 2025", status: "review" },
    ],
    ideas: [
      { id: "i-1", title: "Next.js 16 Cache Primitives Deep Dive", summary: "Explore the new 'use cache' directive and cacheLife profiles." },
      { id: "i-2", title: "eBPF for Application Developers", summary: "What app devs need to know about Cilium and eBPF." },
      { id: "i-3", title: "Warehouse Tech Stack Retrospective", summary: "Lessons learned from building the picking app." },
      { id: "i-4", title: "The Case for Bun in Production", summary: "Performance benchmarks and migration story." },
      { id: "i-5", title: "Tauri vs Electron in 2025", summary: "Honest comparison for desktop app development." },
    ],
    published: [
      { id: "pub-1", title: "Ship It: My Zero-Downtime K8s Upgrade Story", publishedAt: daysAgo(3), url: "https://joshowens.dev/k8s-upgrade" },
      { id: "pub-2", title: "Why I Switched to Neovim (Again)", publishedAt: daysAgo(10), url: "https://joshowens.dev/neovim" },
      { id: "pub-3", title: "Turbopack First Impressions", publishedAt: daysAgo(18), url: "https://joshowens.dev/turbopack" },
    ],
    recentCommits: [
      { sha: "k3f01b2", message: "draft: claude code workflow post (wip)", timestamp: hoursAgo(3) },
      { sha: "l8e72c4", message: "fix: broken image in k8s post", timestamp: hoursAgo(10) },
      { sha: "m2d59f1", message: "publish: ship it k8s upgrade story", timestamp: daysAgo(3) },
      { sha: "n6a14e8", message: "draft: k8s home lab post outline", timestamp: daysAgo(4) },
      { sha: "o9b30c5", message: "chore: update og image generation", timestamp: daysAgo(5) },
    ],
  },
  {
    slug: "arcanelayer-store",
    name: "arcanelayer-store",
    domain: "arcanelayer",
    workflow: "sdlc",
    tags: ["ecommerce", "shopify", "storefront"],
    activityLevel: "stale",
    repoUrl: "https://github.com/arcanelayer/store",
    deployUrl: "https://store.arcanelayer.com",
    openPRCount: 0,
    checkStatus: "passing",
    daysSinceActivity: 14,
    summaryLine: "No active PRD — stale for 2 weeks",
    activePRD: undefined,
    upNextPRDs: [
      {
        id: "prd-5",
        title: "Checkout redesign",
        summary: "Modernize the checkout flow with better UX and reduced friction.",
        status: "queued",
        workItems: [],
      },
      {
        id: "prd-6",
        title: "Product image zoom",
        summary: "Add lightbox zoom functionality on product detail pages.",
        status: "queued",
        workItems: [],
      },
    ],
    shippedPRDs: [
      {
        id: "prd-s1",
        title: "Mobile navigation overhaul",
        summary: "Rebuilt bottom nav with better category browsing.",
        status: "shipped",
        workItems: [],
        completedAt: daysAgo(30),
      },
    ],
    currentBranch: "main",
    recentCommits: [
      { sha: "p7c22a0", message: "chore: dependency updates", timestamp: daysAgo(14) },
      { sha: "q4f81b6", message: "fix: cart total rounding issue", timestamp: daysAgo(15) },
    ],
  },
  {
    slug: "aiteam-brand",
    name: "aiteam-brand",
    domain: "aiteam",
    workflow: "sdlc",
    tags: ["marketing", "landing", "brand"],
    activityLevel: "today",
    repoUrl: "https://github.com/aiteam/brand",
    deployUrl: "https://aiteam.io",
    openPRCount: 1,
    checkStatus: "passing",
    daysSinceActivity: 0,
    summaryLine: "Landing page redesign — all 5 items done, PR approved",
    activePRD: {
      id: "prd-7",
      title: "Landing page redesign",
      summary: "Full visual refresh of the marketing site with new brand identity, updated copy, and improved conversion flow.",
      status: "active",
      workItems: [
        { id: "wi-9", title: "New hero section with animated background", status: "done" },
        { id: "wi-10", title: "Features grid with icon illustrations", status: "done" },
        { id: "wi-11", title: "Social proof / testimonials section", status: "done" },
        { id: "wi-12", title: "Pricing table redesign", status: "done" },
        { id: "wi-13", title: "Mobile responsiveness pass", status: "done" },
      ],
    },
    shippedPRDs: [
      {
        id: "prd-s2",
        title: "Blog setup",
        summary: "MDX-based blog with syntax highlighting and RSS feed.",
        status: "shipped",
        workItems: [],
        completedAt: daysAgo(45),
      },
    ],
    currentBranch: "redesign/landing-page-v2",
    currentPR: {
      id: "pr-2",
      projectSlug: "aiteam-brand",
      number: 23,
      title: "redesign: full landing page refresh",
      branch: "redesign/landing-page-v2",
      status: "approved",
      checkStatus: "passing",
      createdAt: hoursAgo(20),
      url: "https://github.com/aiteam/brand/pull/23",
      author: "joshowens",
      unresolvedComments: 0,
    },
    recentCommits: [
      { sha: "r1d45f8", message: "fix: mobile nav z-index on safari", timestamp: hoursAgo(4) },
      { sha: "s8b67a2", message: "style: final polish on pricing table", timestamp: hoursAgo(7) },
      { sha: "t5e92c0", message: "feat: responsive pass complete", timestamp: hoursAgo(12) },
      { sha: "u3a14b9", message: "feat: testimonials section", timestamp: daysAgo(1) },
      { sha: "v6c30d1", message: "feat: features grid with icons", timestamp: daysAgo(2) },
    ],
  },
  {
    slug: "dragon-sip-sidekicks",
    name: "dragon-sip-sidekicks",
    domain: "arcanelayer",
    workflow: "sdlc",
    tags: ["game", "nft", "web3"],
    activityLevel: "this-week",
    repoUrl: "https://github.com/arcanelayer/dragon-sip-sidekicks",
    deployUrl: "https://dragonsip.xyz",
    openPRCount: 1,
    checkStatus: "passing",
    daysSinceActivity: 1,
    summaryLine: "Multi-color support — 2/4 items done, PR in review",
    activePRD: {
      id: "prd-8",
      title: "Multi-color support",
      summary: "Allow dragons to be rendered in multiple color variants with rarity tiers and animated color shift effects.",
      status: "active",
      workItems: [
        { id: "wi-14", title: "Color palette definition + rarity weights", status: "done" },
        { id: "wi-15", title: "Shader-based color swap on dragon sprites", status: "done" },
        { id: "wi-16", title: "Animated color-shift effect for legendary tier", status: "in-progress" },
        { id: "wi-17", title: "Color filter UI in collection browser", status: "todo" },
      ],
    },
    upNextPRDs: [
      {
        id: "prd-9",
        title: "Dragon marketplace",
        summary: "Peer-to-peer trading interface with escrow smart contract.",
        status: "queued",
        workItems: [],
      },
    ],
    shippedPRDs: [
      {
        id: "prd-s3",
        title: "Dragon stats panel",
        summary: "Detailed stats overlay on dragon cards with trait rarity scores.",
        status: "shipped",
        workItems: [],
        completedAt: daysAgo(20),
      },
    ],
    currentBranch: "feat/multi-color-dragons",
    currentPR: {
      id: "pr-3",
      projectSlug: "dragon-sip-sidekicks",
      number: 91,
      title: "feat: multi-color dragon rendering",
      branch: "feat/multi-color-dragons",
      status: "reviewed",
      checkStatus: "passing",
      createdAt: hoursAgo(28),
      url: "https://github.com/arcanelayer/dragon-sip-sidekicks/pull/91",
      author: "joshowens",
      unresolvedComments: 2,
    },
    recentCommits: [
      { sha: "w9f55e3", message: "wip: legendary color-shift animation", timestamp: hoursAgo(18) },
      { sha: "x2a78c6", message: "feat: shader color swap on sprites", timestamp: daysAgo(1) },
      { sha: "y7b12f4", message: "feat: color palette + rarity weights", timestamp: daysAgo(2) },
      { sha: "z4e90a1", message: "chore: setup shader pipeline", timestamp: daysAgo(3) },
      { sha: "aa1d67b", message: "docs: multi-color PRD implementation notes", timestamp: daysAgo(4) },
    ],
  },
]

export const ALL_PRS: PullRequest[] = PROJECTS.flatMap((p) => (p.currentPR ? [p.currentPR] : []))

export const TIMELINE_EVENTS: TimelineEvent[] = [
  // Today
  { id: "te-1", projectSlug: "picking-app", type: "commit", description: "add multi-barcode batch scan mode (WIP)", timestamp: hoursAgo(2), metadata: { sha: "a3f92c1" } },
  { id: "te-2", projectSlug: "joshowens-dev", type: "commit", description: "draft: claude code workflow post (wip)", timestamp: hoursAgo(3), metadata: { sha: "k3f01b2" } },
  { id: "te-3", projectSlug: "aiteam-brand", type: "commit", description: "fix: mobile nav z-index on safari", timestamp: hoursAgo(4) },
  { id: "te-4", projectSlug: "picking-app", type: "commit", description: "fix: camera permission dialog on Android", timestamp: hoursAgo(5), metadata: { sha: "b1e4d78" } },
  { id: "te-5", projectSlug: "aiteam-brand", type: "pr-reviewed", description: "PR #23 approved: redesign: full landing page refresh", timestamp: hoursAgo(6), metadata: { pr: "23" } },
  { id: "te-6", projectSlug: "aiteam-brand", type: "commit", description: "style: final polish on pricing table", timestamp: hoursAgo(7) },
  { id: "te-7", projectSlug: "joshowens-dev", type: "commit", description: "fix: broken image in k8s post", timestamp: hoursAgo(10) },
  { id: "te-8", projectSlug: "aiteam-brand", type: "commit", description: "feat: responsive pass complete", timestamp: hoursAgo(12) },
  { id: "te-9", projectSlug: "picking-app", type: "commit", description: "feat: scan-to-confirm UX flow", timestamp: hoursAgo(8) },
  // Yesterday
  { id: "te-10", projectSlug: "dragon-sip-sidekicks", type: "commit", description: "wip: legendary color-shift animation", timestamp: hoursAgo(18) },
  { id: "te-11", projectSlug: "dragon-sip-sidekicks", type: "pr-opened", description: "Opened PR #91: feat: multi-color dragon rendering", timestamp: hoursAgo(20), metadata: { pr: "91" } },
  { id: "te-12", projectSlug: "aiteam-brand", type: "pr-opened", description: "Opened PR #23: redesign: full landing page refresh", timestamp: hoursAgo(20), metadata: { pr: "23" } },
  { id: "te-13", projectSlug: "aiteam-brand", type: "commit", description: "feat: testimonials section", timestamp: hoursAgo(22) },
  { id: "te-14", projectSlug: "picking-app", type: "prd-update", description: "PRD updated: Barcode scanning support — 3/5 items done", timestamp: hoursAgo(24) },
  { id: "te-15", projectSlug: "picking-app", type: "pr-opened", description: "Opened PR #47: feat: barcode scanner integration", timestamp: hoursAgo(26) },
  { id: "te-16", projectSlug: "dragon-sip-sidekicks", type: "commit", description: "feat: shader color swap on sprites", timestamp: hoursAgo(28) },
  // 2 days ago
  { id: "te-17", projectSlug: "joshowens-dev", type: "draft-started", description: "Started draft: How I Use Claude Code in My Daily Workflow", timestamp: daysAgo(2) },
  { id: "te-18", projectSlug: "dragon-sip-sidekicks", type: "commit", description: "feat: color palette + rarity weights", timestamp: daysAgo(2) },
  { id: "te-19", projectSlug: "aiteam-brand", type: "commit", description: "feat: features grid with icons", timestamp: daysAgo(2) },
  // 3 days ago
  { id: "te-20", projectSlug: "joshowens-dev", type: "published", description: "Published: Ship It: My Zero-Downtime K8s Upgrade Story", timestamp: daysAgo(3), metadata: { url: "https://joshowens.dev/k8s-upgrade" } },
  { id: "te-21", projectSlug: "joshowens-dev", type: "deploy", description: "Deployed to joshowens.dev (production)", timestamp: daysAgo(3) },
  { id: "te-22", projectSlug: "k8s-infra", type: "commit", description: "wip: network policy manifest migration", timestamp: daysAgo(3) },
  // 4 days ago
  { id: "te-23", projectSlug: "joshowens-dev", type: "draft-started", description: "Started draft: Building a Kubernetes Home Lab in 2025", timestamp: daysAgo(4) },
  { id: "te-24", projectSlug: "k8s-infra", type: "commit", description: "docs: Cilium staging validation notes", timestamp: daysAgo(4) },
  { id: "te-25", projectSlug: "k8s-infra", type: "prd-update", description: "PRD updated: Migrate to Cilium CNI — 1/3 items done", timestamp: daysAgo(4) },
  // 5 days ago
  { id: "te-26", projectSlug: "k8s-infra", type: "commit", description: "feat: Cilium install complete on staging", timestamp: daysAgo(5) },
  { id: "te-27", projectSlug: "joshowens-dev", type: "commit", description: "chore: update og image generation", timestamp: daysAgo(5) },
]

export function getProject(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug)
}

export function getDomainColor(domain: Domain): string {
  switch (domain) {
    case "arcanelayer": return "domain-arcanelayer"
    case "aiteam": return "domain-aiteam"
    case "joshowensdev": return "domain-joshowensdev"
    case "infrastructure": return "domain-infrastructure"
    case "wendyowensbooks": return "domain-wendyowensbooks"
  }
}

export function getRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  return `${days}d ago`
}

export function getPRAge(createdAt: string): { label: string; color: string } {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000
  if (hours < 24) return { label: `${Math.floor(hours)}h`, color: "text-emerald-400" }
  const days = Math.floor(hours / 24)
  if (days <= 3) return { label: `${days}d`, color: "text-amber-400" }
  return { label: `${days}d`, color: "text-red-400" }
}
