import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../lib/generated/prisma/client"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is not set")

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Clean existing data
  await prisma.event.deleteMany()
  await prisma.workItem.deleteMany()
  await prisma.pullRequest.deleteMany()
  await prisma.branch.deleteMany()
  await prisma.prd.deleteMany()
  await prisma.project.deleteMany()

  // --- Projects ---
  const devtrack = await prisma.project.create({
    data: {
      name: "DevTrack",
      workflow: "sdlc",
      domain: "devtools",
      repoUrl: "https://github.com/queso/DevTrack",
      mainBranch: "main",
      prdPath: "prd",
      tags: ["nextjs", "typescript", "prisma"],
      lastActivityAt: new Date(),
    },
  })

  const arcaneLayer = await prisma.project.create({
    data: {
      name: "Arcane Layer Storefront",
      workflow: "sdlc",
      domain: "ecommerce",
      repoUrl: "https://github.com/queso/arcane-layer-storefront",
      mainBranch: "main",
      tags: ["hydrogen", "shopify", "remix"],
      lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  })

  const blogEngine = await prisma.project.create({
    data: {
      name: "Personal Blog",
      workflow: "content",
      domain: "content",
      repoUrl: "https://github.com/queso/blog",
      mainBranch: "main",
      tags: ["astro", "markdown"],
      lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  })

  // --- PRDs ---
  const prd1 = await prisma.prd.create({
    data: {
      projectId: devtrack.id,
      title: "Cleanup and Gaps",
      summary: "Strip dead code, fix API gaps, add deployment docs",
      status: "in_progress",
      sourcePath: "prd/007-cleanup-and-gaps.md",
    },
  })

  const prd2 = await prisma.prd.create({
    data: {
      projectId: devtrack.id,
      title: "Hook Telemetry Pipeline",
      summary: "End-to-end hook event capture and dashboard display",
      status: "queued",
      sourcePath: "prd/008-hook-telemetry.md",
    },
  })

  const prd3 = await prisma.prd.create({
    data: {
      projectId: arcaneLayer.id,
      title: "Cart Drawer Redesign",
      summary: "Slide-out cart with upsell recommendations",
      status: "in_progress",
      sourcePath: "prd/003-cart-drawer.md",
    },
  })

  // --- Work Items ---
  await prisma.workItem.createMany({
    data: [
      { prdId: prd1.id, title: "Strip content workflow code", status: "done", order: 1 },
      { prdId: prd1.id, title: "Remove mock data and designs directory", status: "done", order: 2 },
      { prdId: prd1.id, title: "Add domain filter to events API", status: "done", order: 3 },
      { prdId: prd1.id, title: "CLI hooks install/uninstall/test", status: "done", order: 4 },
      { prdId: prd1.id, title: "Deployment documentation", status: "in_progress", order: 5 },
      { prdId: prd1.id, title: "Seed script for local dev", status: "in_progress", order: 6 },
      { prdId: prd2.id, title: "Define event schema for hooks", status: "todo", order: 1 },
      { prdId: prd2.id, title: "Build event ingestion endpoint", status: "todo", order: 2 },
      { prdId: prd3.id, title: "Cart drawer component", status: "done", order: 1 },
      { prdId: prd3.id, title: "Upsell product recommendations", status: "in_progress", order: 2 },
    ],
  })

  // --- Branches ---
  const branch1 = await prisma.branch.create({
    data: {
      projectId: devtrack.id,
      prdId: prd1.id,
      name: "feat/prd-007-cleanup-and-gaps",
      isActive: true,
    },
  })

  const branch2 = await prisma.branch.create({
    data: {
      projectId: arcaneLayer.id,
      prdId: prd3.id,
      name: "feat/cart-drawer-redesign",
      isActive: true,
    },
  })

  const branch3 = await prisma.branch.create({
    data: {
      projectId: blogEngine.id,
      name: "posts/march-2026-roundup",
      isActive: true,
    },
  })

  // --- Pull Requests ---
  const pr1 = await prisma.pullRequest.create({
    data: {
      projectId: devtrack.id,
      branchId: branch1.id,
      prdId: prd1.id,
      githubId: 10001,
      number: 42,
      title: "feat: cleanup dead code and close API gaps",
      status: "open",
      url: "https://github.com/queso/DevTrack/pull/42",
      author: "queso",
      checkStatus: "passing",
      openedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
  })

  const pr2 = await prisma.pullRequest.create({
    data: {
      projectId: devtrack.id,
      branchId: branch1.id,
      githubId: 10002,
      number: 41,
      title: "fix: resolve CI failures — type errors, missing deps",
      status: "merged",
      url: "https://github.com/queso/DevTrack/pull/41",
      author: "queso",
      checkStatus: "passing",
      openedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      mergedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  })

  const pr3 = await prisma.pullRequest.create({
    data: {
      projectId: arcaneLayer.id,
      branchId: branch2.id,
      prdId: prd3.id,
      githubId: 20001,
      number: 18,
      title: "feat: cart drawer with slide-out animation",
      status: "review_requested",
      url: "https://github.com/queso/arcane-layer-storefront/pull/18",
      author: "queso",
      checkStatus: "passing",
      openedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
  })

  await prisma.pullRequest.create({
    data: {
      projectId: blogEngine.id,
      branchId: branch3.id,
      githubId: 30001,
      number: 7,
      title: "content: March 2026 roundup post",
      status: "draft",
      url: "https://github.com/queso/blog/pull/7",
      author: "queso",
      openedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    },
  })

  // --- Events (recent timeline) ---
  const now = Date.now()
  await prisma.event.createMany({
    data: [
      {
        projectId: devtrack.id,
        pullRequestId: pr1.id,
        type: "pr_opened",
        title: "PR #42 opened: cleanup dead code and close API gaps",
        occurredAt: new Date(now - 3 * 60 * 60 * 1000),
      },
      {
        projectId: devtrack.id,
        type: "commit",
        title: "fix: resolve all CI failures",
        metadata: JSON.stringify({ branch: "feat/prd-007-cleanup-and-gaps", hash: "c212076" }),
        occurredAt: new Date(now - 4 * 60 * 60 * 1000),
      },
      {
        projectId: devtrack.id,
        pullRequestId: pr2.id,
        type: "pr_merged",
        title: "PR #41 merged: resolve CI failures",
        occurredAt: new Date(now - 24 * 60 * 60 * 1000),
      },
      {
        projectId: devtrack.id,
        prdId: prd1.id,
        type: "prd_synced",
        title: "PRD synced: Cleanup and Gaps",
        occurredAt: new Date(now - 25 * 60 * 60 * 1000),
      },
      {
        projectId: devtrack.id,
        type: "session_start",
        title: "Claude session started",
        occurredAt: new Date(now - 1 * 60 * 60 * 1000),
      },
      {
        projectId: devtrack.id,
        type: "session_end",
        title: "Claude session ended",
        metadata: JSON.stringify({ duration: 2400 }),
        occurredAt: new Date(now - 30 * 60 * 1000),
      },
      {
        projectId: arcaneLayer.id,
        pullRequestId: pr3.id,
        type: "pr_opened",
        title: "PR #18 opened: cart drawer with slide-out animation",
        occurredAt: new Date(now - 5 * 60 * 60 * 1000),
      },
      {
        projectId: arcaneLayer.id,
        pullRequestId: pr3.id,
        type: "pr_review_requested",
        title: "Review requested on PR #18",
        occurredAt: new Date(now - 4.5 * 60 * 60 * 1000),
      },
      {
        projectId: arcaneLayer.id,
        type: "commit",
        title: "feat: add upsell recommendation engine",
        metadata: JSON.stringify({ branch: "feat/cart-drawer-redesign", hash: "a1b2c3d" }),
        occurredAt: new Date(now - 2 * 60 * 60 * 1000),
      },
      {
        projectId: blogEngine.id,
        type: "branch_created",
        title: "Branch created: posts/march-2026-roundup",
        occurredAt: new Date(now - 48 * 60 * 60 * 1000),
      },
      {
        projectId: blogEngine.id,
        type: "commit",
        title: "draft: March 2026 roundup post",
        metadata: JSON.stringify({ branch: "posts/march-2026-roundup", hash: "f4e5d6c" }),
        occurredAt: new Date(now - 46 * 60 * 60 * 1000),
      },
    ],
  })

  console.log("Seeded:")
  console.log(`  3 projects (${devtrack.id}, ${arcaneLayer.id}, ${blogEngine.id})`)
  console.log(`  3 PRDs, 10 work items`)
  console.log(`  3 branches, 4 pull requests`)
  console.log(`  11 events`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
