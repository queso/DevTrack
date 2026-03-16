const spec = {
  openapi: "3.1.0",
  info: {
    title: "DevTrack API",
    version: "1.0.0",
    description:
      "Mission control for multi-repo development. Track SDLC state, content pipelines, and PR queues across all your projects.",
  },
  servers: [{ url: "/api/v1", description: "Current server" }],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key authentication via Authorization: Bearer <key>",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error", "message"],
        properties: {
          error: { type: "string", description: "Error code" },
          message: { type: "string", description: "Human-readable error message" },
          correlationId: { type: "string" },
          details: {},
        },
      },
      PaginationMeta: {
        type: "object",
        required: ["total", "page", "per_page"],
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          per_page: { type: "integer" },
        },
      },
      EnvelopeResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {},
          meta: { $ref: "#/components/schemas/PaginationMeta" },
        },
      },
      Workflow: { type: "string", enum: ["sdlc", "content"] },
      PrdStatus: { type: "string", enum: ["queued", "in_progress", "completed"] },
      WorkItemStatus: { type: "string", enum: ["todo", "in_progress", "done"] },
      ContentItemStatus: { type: "string", enum: ["idea", "draft", "published"] },
      PullRequestStatus: {
        type: "string",
        enum: ["open", "closed", "merged", "draft", "review_requested", "changes_requested", "approved"],
      },
      CheckStatus: { type: "string", enum: ["pending", "passing", "failing"] },
      EventType: {
        type: "string",
        enum: [
          "pr_opened", "pr_merged", "pr_closed", "pr_review_requested",
          "pr_changes_requested", "pr_approved", "branch_created", "branch_deleted",
          "prd_created", "prd_updated", "prd_completed", "work_item_created",
          "work_item_completed", "content_published", "commit",
        ],
      },
      Project: {
        type: "object",
        required: ["id", "name", "workflow"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          workflow: { $ref: "#/components/schemas/Workflow" },
          domain: { type: "string", nullable: true },
          owner: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" } },
          repoUrl: { type: "string", nullable: true },
          mainBranch: { type: "string", default: "main" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateProject: {
        type: "object",
        required: ["name", "workflow"],
        properties: {
          name: { type: "string" },
          workflow: { $ref: "#/components/schemas/Workflow" },
          domain: { type: "string" },
          owner: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          repo_url: { type: "string", format: "uri" },
          main_branch: { type: "string", default: "main" },
        },
      },
      Prd: {
        type: "object",
        required: ["id", "projectId", "title", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          title: { type: "string" },
          summary: { type: "string", nullable: true },
          status: { $ref: "#/components/schemas/PrdStatus" },
          sourcePath: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      WorkItem: {
        type: "object",
        required: ["id", "prdId", "title", "status", "order"],
        properties: {
          id: { type: "string", format: "uuid" },
          prdId: { type: "string", format: "uuid" },
          title: { type: "string" },
          status: { $ref: "#/components/schemas/WorkItemStatus" },
          order: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ContentItem: {
        type: "object",
        required: ["id", "projectId", "title", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          title: { type: "string" },
          summary: { type: "string", nullable: true },
          status: { $ref: "#/components/schemas/ContentItemStatus" },
          tags: { type: "array", items: { type: "string" } },
          publishedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PullRequest: {
        type: "object",
        required: ["id", "projectId", "githubId", "number", "title", "status", "url", "author", "openedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          githubId: { type: "integer" },
          number: { type: "integer" },
          title: { type: "string" },
          status: { $ref: "#/components/schemas/PullRequestStatus" },
          url: { type: "string", format: "uri" },
          author: { type: "string" },
          checkStatus: { $ref: "#/components/schemas/CheckStatus", nullable: true },
          openedAt: { type: "string", format: "date-time" },
          mergedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Branch: {
        type: "object",
        required: ["id", "projectId", "name", "isActive"],
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Event: {
        type: "object",
        required: ["id", "projectId", "type", "title", "occurredAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          type: { $ref: "#/components/schemas/EventType" },
          title: { type: "string" },
          metadata: { type: "object" },
          occurredAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        operationId: "getHealth",
        summary: "Health check",
        security: [],
        tags: ["Health"],
        responses: {
          200: { description: "Service healthy", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" } } } } } },
        },
      },
    },
    "/api/v1/projects": {
      get: {
        operationId: "listProjects",
        summary: "List all projects",
        tags: ["Projects"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "domain", in: "query", schema: { type: "string" } },
          { name: "workflow", in: "query", schema: { $ref: "#/components/schemas/Workflow" } },
        ],
        responses: {
          200: { description: "Paginated project list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        operationId: "createProject",
        summary: "Create a project",
        tags: ["Projects"],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProject" } } } },
        responses: {
          201: { description: "Created project", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          422: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}": {
      get: {
        operationId: "getProject",
        summary: "Get a project",
        tags: ["Projects"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Project", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      patch: {
        operationId: "updateProject",
        summary: "Update a project",
        tags: ["Projects"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProject" } } } },
        responses: {
          200: { description: "Updated project", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      delete: {
        operationId: "deleteProject",
        summary: "Delete a project",
        tags: ["Projects"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          204: { description: "Deleted" },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}/status": {
      get: {
        operationId: "getProjectStatus",
        summary: "Get project status summary",
        tags: ["Projects"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Project status", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}/prds": {
      get: {
        operationId: "listProjectPrds",
        summary: "List PRDs for a project",
        tags: ["PRDs"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "PRD list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Project not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        operationId: "createPrd",
        summary: "Create a PRD",
        tags: ["PRDs"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Prd" } } } },
        responses: {
          201: { description: "Created PRD", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/prds": {
      get: {
        operationId: "listPrds",
        summary: "List all PRDs",
        tags: ["PRDs"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "PRD list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/prds/{id}": {
      get: {
        operationId: "getPrd",
        summary: "Get a PRD with work items",
        tags: ["PRDs"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "PRD", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      patch: {
        operationId: "updatePrd",
        summary: "Update a PRD",
        tags: ["PRDs"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Prd" } } } },
        responses: {
          200: { description: "Updated PRD", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/prds/{id}/work-items": {
      get: {
        operationId: "listWorkItems",
        summary: "List work items for a PRD",
        tags: ["WorkItems"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Work items", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        operationId: "createWorkItem",
        summary: "Create a work item",
        tags: ["WorkItems"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkItem" } } } },
        responses: {
          201: { description: "Created work item", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}/content": {
      get: {
        operationId: "listContent",
        summary: "List content items for a project",
        tags: ["Content"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/ContentItemStatus" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Content list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        operationId: "createContent",
        summary: "Create a content item",
        tags: ["Content"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ContentItem" } } } },
        responses: {
          201: { description: "Created content item", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/content/{id}": {
      get: {
        operationId: "getContent",
        summary: "Get a content item",
        tags: ["Content"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Content item", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      patch: {
        operationId: "updateContent",
        summary: "Update a content item (supports promotion)",
        tags: ["Content"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ContentItem" } } } },
        responses: {
          200: { description: "Updated content item", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          422: { description: "Invalid transition", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      delete: {
        operationId: "deleteContent",
        summary: "Delete a content item",
        tags: ["Content"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          204: { description: "Deleted" },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/prs": {
      get: {
        operationId: "listPullRequests",
        summary: "List all pull requests (PR queue)",
        tags: ["PullRequests"],
        parameters: [
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/PullRequestStatus" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "PR list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/prs/{id}": {
      get: {
        operationId: "getPullRequest",
        summary: "Get a pull request",
        tags: ["PullRequests"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Pull request", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      patch: {
        operationId: "updatePullRequest",
        summary: "Update a pull request",
        tags: ["PullRequests"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PullRequest" } } } },
        responses: {
          200: { description: "Updated PR", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}/prs": {
      get: {
        operationId: "listProjectPullRequests",
        summary: "List pull requests for a project",
        tags: ["PullRequests"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "PR list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
      post: {
        operationId: "syncPullRequest",
        summary: "Sync a pull request from GitHub",
        tags: ["PullRequests"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PullRequest" } } } },
        responses: {
          201: { description: "Synced PR", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/branches/{id}": {
      get: {
        operationId: "getBranch",
        summary: "Get a branch",
        tags: ["Branches"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Branch", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      patch: {
        operationId: "updateBranch",
        summary: "Update a branch",
        tags: ["Branches"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Branch" } } } },
        responses: {
          200: { description: "Updated branch", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}/branches": {
      get: {
        operationId: "listProjectBranches",
        summary: "List branches for a project",
        tags: ["Branches"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "is_active", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: { description: "Branch list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        operationId: "createBranch",
        summary: "Register a branch",
        tags: ["Branches"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Branch" } } } },
        responses: {
          201: { description: "Created branch", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/events": {
      get: {
        operationId: "listEvents",
        summary: "List events (cross-project timeline)",
        tags: ["Events"],
        parameters: [
          { name: "project_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "type", in: "query", schema: { $ref: "#/components/schemas/EventType" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Event list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
      post: {
        operationId: "createEvent",
        summary: "Record an event",
        tags: ["Events"],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
        responses: {
          201: { description: "Created event", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/events/summary": {
      get: {
        operationId: "getEventSummary",
        summary: "Get daily event summary grouped by project",
        tags: ["Events"],
        parameters: [
          { name: "date", in: "query", schema: { type: "string", format: "date" }, description: "Target date (defaults to today)" },
        ],
        responses: {
          200: { description: "Event summary", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
        },
      },
    },
    "/api/v1/projects/{id}/events": {
      get: {
        operationId: "listProjectEvents",
        summary: "List events for a project",
        tags: ["Events"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Event list", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/webhooks/github": {
      post: {
        operationId: "githubWebhook",
        summary: "Receive GitHub webhook events",
        security: [],
        tags: ["Webhooks"],
        parameters: [
          { name: "X-GitHub-Event", in: "header", required: true, schema: { type: "string" } },
          { name: "X-Hub-Signature-256", in: "header", required: true, schema: { type: "string" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          200: { description: "Webhook processed", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          401: { description: "Invalid signature", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
  },
}

export async function GET(_request: Request) {
  return Response.json(spec, {
    headers: { "Content-Type": "application/json" },
  })
}
