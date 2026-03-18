package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"devtrack/internal/client"
)

// ---------------------------------------------------------------------------
// Helpers for building HTTP test servers
// ---------------------------------------------------------------------------

// testProjectRecord is a minimal representation of a project as returned by
// the list endpoint.
type testProjectRecord struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// testStatusRecord mirrors what GET /projects/{id}/status returns inside data.
type testStatusRecord struct {
	ProjectID      string     `json:"project_id"`
	ActivePRDCount int        `json:"active_prd_count"`
	OpenPRCount    int        `json:"open_pr_count"`
	LastActivityAt *time.Time `json:"last_activity_at"`
}

// testPRDRecord is a minimal PRD record returned by GET /projects/{id}/prds.
type testPRDRecord struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

// envelopeData wraps a payload in the {"data": ...} envelope the server uses.
func envelopeData(payload interface{}) map[string]interface{} {
	return map[string]interface{}{"data": payload}
}

// paginatedData wraps a slice payload in the paginated {"data": [...]} shape.
func paginatedData(items interface{}) map[string]interface{} {
	return map[string]interface{}{"data": items}
}

// mustJSON serialises v to JSON or panics — test helper only.
func mustJSON(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// ---------------------------------------------------------------------------
// Test 1: happy path — projects with and without active PRDs
// ---------------------------------------------------------------------------

// TestAPIClient_ListDashboardProjects_HappyPath verifies that
// apiDashboardClient correctly calls the projects list endpoint, the per-project
// status endpoint, and (when active PRDs exist) the PRDs endpoint to populate
// the ActivePRD title.
func TestAPIClient_ListDashboardProjects_HappyPath(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	threeDaysAgo := now.Add(-72 * time.Hour)

	projects := []testProjectRecord{
		{ID: "proj-aaa", Name: "alpha-service"},
		{ID: "proj-bbb", Name: "beta-api"},
	}

	statusMap := map[string]testStatusRecord{
		"proj-aaa": {
			ProjectID:      "proj-aaa",
			ActivePRDCount: 1,
			OpenPRCount:    2,
			LastActivityAt: &now,
		},
		"proj-bbb": {
			ProjectID:      "proj-bbb",
			ActivePRDCount: 0,
			OpenPRCount:    0,
			LastActivityAt: &threeDaysAgo,
		},
	}

	prdsMap := map[string][]testPRDRecord{
		"proj-aaa": {{ID: "prd-1", Title: "PRD-001: Auth Rework", Status: "in_progress"}},
		"proj-bbb": {},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/projects":
			w.Write(mustJSON(paginatedData(projects)))

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/projects/proj-aaa/status":
			w.Write(mustJSON(envelopeData(statusMap["proj-aaa"])))

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/projects/proj-bbb/status":
			w.Write(mustJSON(envelopeData(statusMap["proj-bbb"])))

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/projects/proj-aaa/prds":
			w.Write(mustJSON(paginatedData(prdsMap["proj-aaa"])))

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/projects/proj-bbb/prds":
			w.Write(mustJSON(paginatedData(prdsMap["proj-bbb"])))

		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := client.NewClient(srv.URL+"/api/v1", "test-token")
	api := &apiDashboardClient{c: c}

	result, err := api.ListDashboardProjects()
	if err != nil {
		t.Fatalf("ListDashboardProjects returned unexpected error: %v", err)
	}

	if len(result) != 2 {
		t.Fatalf("expected 2 projects, got %d", len(result))
	}

	// Find each project by name in the result.
	var alpha, beta *DashboardProject
	for i := range result {
		switch result[i].Project.Name {
		case "alpha-service":
			alpha = &result[i]
		case "beta-api":
			beta = &result[i]
		}
	}

	if alpha == nil {
		t.Fatal("alpha-service not found in result")
	}
	if beta == nil {
		t.Fatal("beta-api not found in result")
	}

	// alpha-service has an active PRD — title should be populated.
	if alpha.ActivePRD != "PRD-001: Auth Rework" {
		t.Errorf("alpha-service ActivePRD: got %q, want %q", alpha.ActivePRD, "PRD-001: Auth Rework")
	}
	// alpha-service last activity is "now".
	if alpha.LastActivity.IsZero() {
		t.Error("alpha-service LastActivity should not be zero")
	}

	// beta-api has no active PRDs — ActivePRD should be empty.
	if beta.ActivePRD != "" {
		t.Errorf("beta-api ActivePRD: got %q, want empty", beta.ActivePRD)
	}
	// beta-api last activity is three days ago.
	if beta.LastActivity.IsZero() {
		t.Error("beta-api LastActivity should not be zero")
	}
}

// ---------------------------------------------------------------------------
// Test 2: projects list endpoint failure
// ---------------------------------------------------------------------------

// TestAPIClient_ListDashboardProjects_ProjectsError verifies that when the
// /projects endpoint returns an error, ListDashboardProjects surfaces it.
func TestAPIClient_ListDashboardProjects_ProjectsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/projects" {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error":"internal server error"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := client.NewClient(srv.URL+"/api/v1", "test-token")
	api := &apiDashboardClient{c: c}

	_, err := api.ListDashboardProjects()
	if err == nil {
		t.Fatal("expected error when /projects returns 500, got nil")
	}
}

// ---------------------------------------------------------------------------
// Test 3: status endpoint failure for one project is surfaced
// ---------------------------------------------------------------------------

// TestAPIClient_ListDashboardProjects_StatusError verifies that when a
// per-project /status endpoint returns an error, ListDashboardProjects
// surfaces it rather than silently swallowing it.
func TestAPIClient_ListDashboardProjects_StatusError(t *testing.T) {
	projects := []testProjectRecord{
		{ID: "proj-err", Name: "error-project"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/projects":
			w.Write(mustJSON(paginatedData(projects)))
		case "/api/v1/projects/proj-err/status":
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error":"db error"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := client.NewClient(srv.URL+"/api/v1", "test-token")
	api := &apiDashboardClient{c: c}

	_, err := api.ListDashboardProjects()
	if err == nil {
		t.Fatal("expected error when /status returns 500, got nil")
	}
}

// ---------------------------------------------------------------------------
// Test 4: empty project list — returns empty slice, no error
// ---------------------------------------------------------------------------

// TestAPIClient_ListDashboardProjects_Empty verifies that when the API returns
// an empty project list, ListDashboardProjects returns an empty slice with no
// error.
func TestAPIClient_ListDashboardProjects_Empty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/v1/projects" {
			w.Write(mustJSON(paginatedData([]testProjectRecord{})))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := client.NewClient(srv.URL+"/api/v1", "test-token")
	api := &apiDashboardClient{c: c}

	result, err := api.ListDashboardProjects()
	if err != nil {
		t.Fatalf("expected no error for empty list, got: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty result, got %d projects", len(result))
	}
}

// ---------------------------------------------------------------------------
// Test 5: project with null last_activity_at — LastActivity is zero time
// ---------------------------------------------------------------------------

// TestAPIClient_ListDashboardProjects_NullLastActivity verifies that when the
// status response has a null last_activity_at, the resulting DashboardProject
// has a zero LastActivity time (which classifyActivity will treat as stale).
func TestAPIClient_ListDashboardProjects_NullLastActivity(t *testing.T) {
	projects := []testProjectRecord{
		{ID: "proj-new", Name: "new-project"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/projects":
			w.Write(mustJSON(paginatedData(projects)))
		case "/api/v1/projects/proj-new/status":
			// last_activity_at is null — project has no events yet.
			status := map[string]interface{}{
				"project_id":       "proj-new",
				"active_prd_count": 0,
				"open_pr_count":    0,
				"last_activity_at": nil,
			}
			w.Write(mustJSON(envelopeData(status)))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := client.NewClient(srv.URL+"/api/v1", "test-token")
	api := &apiDashboardClient{c: c}

	result, err := api.ListDashboardProjects()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result))
	}
	// LastActivity must be zero when last_activity_at is null.
	if !result[0].LastActivity.IsZero() {
		t.Errorf("expected zero LastActivity for null last_activity_at, got %v", result[0].LastActivity)
	}
}
