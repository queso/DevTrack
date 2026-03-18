package cmd

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Fakes / test doubles
// ---------------------------------------------------------------------------

// fakeStatusAPI is a test double for the StatusAPI interface that runStatus
// accepts. It records calls and returns canned responses.
type fakeStatusAPI struct {
	// ListProjects behaviour
	listProjects    []StatusProjectSummary
	listProjectsErr error

	// ListProjectPRDs behaviour
	listPRDs    []StatusPRD
	listPRDsErr error

	// ListProjectPullRequests behaviour
	listPRs    []StatusPR
	listPRsErr error

	// ListProjectEvents behaviour
	listEvents    []StatusEvent
	listEventsErr error

	// Recorded calls (for assertion)
	prdsProjectID   string
	prsProjectID    string
	eventsProjectID string
}

func (f *fakeStatusAPI) ListProjects() ([]StatusProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeStatusAPI) ListProjectPRDs(projectID string) ([]StatusPRD, error) {
	f.prdsProjectID = projectID
	return f.listPRDs, f.listPRDsErr
}

func (f *fakeStatusAPI) ListProjectPullRequests(projectID string) ([]StatusPR, error) {
	f.prsProjectID = projectID
	return f.listPRs, f.listPRsErr
}

func (f *fakeStatusAPI) ListProjectEvents(projectID string, limit int) ([]StatusEvent, error) {
	f.eventsProjectID = projectID
	return f.listEvents, f.listEventsErr
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// validManifestForStatus is a minimal valid project.yaml for status tests.
const validManifestForStatus = `
name: my-project
workflow: sdlc
repo_url: https://github.com/example/my-project
`

// ---------------------------------------------------------------------------
// Tests: runStatus happy paths
// ---------------------------------------------------------------------------

// TestStatus_ShowsCountsAndEvents verifies that when the project has active
// PRDs, open PRs, and events, runStatus outputs the correct counts and recent
// events.
func TestStatus_ShowsCountsAndEvents(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestForStatus)

	projectID := "proj-uuid-1234"
	api := &fakeStatusAPI{
		listProjects: []StatusProjectSummary{
			{ID: projectID, Name: "my-project"},
		},
		listPRDs: []StatusPRD{
			{ID: "prd-1", Title: "Feature A", Status: "active"},
			{ID: "prd-2", Title: "Feature B", Status: "active"},
			{ID: "prd-3", Title: "Old Feature", Status: "draft"},
		},
		listPRs: []StatusPR{
			{ID: "pr-1", Title: "Fix bug", Status: "open"},
			{ID: "pr-2", Title: "Add tests", Status: "open"},
		},
		listEvents: []StatusEvent{
			{ID: "evt-1", EventType: "push", Message: "Pushed to main", CreatedAt: "2024-01-01T10:00:00Z"},
			{ID: "evt-2", EventType: "commit", Message: "Fixed typo", CreatedAt: "2024-01-01T09:00:00Z"},
		},
	}

	var out bytes.Buffer
	err := runStatus(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runStatus returned unexpected error: %v", err)
	}

	got := out.String()

	// Output must show active PRD count.
	if !strings.Contains(got, "2") {
		t.Errorf("output %q should contain active PRD count (2)", got)
	}

	// Output must show open PR count.
	if !strings.Contains(got, "2") {
		t.Errorf("output %q should contain open PR count (2)", got)
	}

	// Output must include recent event data.
	if !strings.Contains(got, "push") && !strings.Contains(got, "Pushed to main") {
		t.Errorf("output %q should include recent event type or message", got)
	}

	// API calls must use the resolved project ID.
	if api.prdsProjectID != projectID {
		t.Errorf("ListProjectPRDs called with %q, want %q", api.prdsProjectID, projectID)
	}
	if api.prsProjectID != projectID {
		t.Errorf("ListProjectPullRequests called with %q, want %q", api.prsProjectID, projectID)
	}
	if api.eventsProjectID != projectID {
		t.Errorf("ListProjectEvents called with %q, want %q", api.eventsProjectID, projectID)
	}
}

// TestStatus_NoData verifies that when the project has no PRDs, PRs, or events,
// runStatus shows appropriate empty-state messages rather than blank output or
// an error.
func TestStatus_NoData(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestForStatus)

	api := &fakeStatusAPI{
		listProjects: []StatusProjectSummary{
			{ID: "proj-empty", Name: "my-project"},
		},
		listPRDs:   []StatusPRD{},
		listPRs:    []StatusPR{},
		listEvents: []StatusEvent{},
	}

	var out bytes.Buffer
	err := runStatus(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runStatus returned unexpected error: %v", err)
	}

	got := strings.ToLower(out.String())

	// Output must communicate there are no active PRDs.
	if !strings.Contains(got, "no") && !strings.Contains(got, "0") {
		t.Errorf("output %q should indicate no active PRDs (e.g. 'no active PRDs' or count 0)", got)
	}
}

// ---------------------------------------------------------------------------
// Tests: runStatus error paths
// ---------------------------------------------------------------------------

// TestStatus_MissingManifest verifies that a clear error is returned when no
// project.yaml file exists at the given path.
func TestStatus_MissingManifest(t *testing.T) {
	api := &fakeStatusAPI{}
	var out bytes.Buffer

	err := runStatus("/nonexistent/path/project.yaml", api, false, &out)
	if err == nil {
		t.Fatal("expected error for missing project.yaml, got nil")
	}

	// No API calls should be made when the manifest cannot be read.
	if api.prdsProjectID != "" || api.prsProjectID != "" || api.eventsProjectID != "" {
		t.Error("expected no API calls when manifest is missing")
	}
}

// TestStatus_APIError verifies that a clear error is returned when the API
// call to list projects fails.
func TestStatus_APIError(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestForStatus)

	api := &fakeStatusAPI{
		listProjectsErr: errors.New("connection refused"),
	}
	var out bytes.Buffer

	err := runStatus(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when API is unreachable, got nil")
	}

	errMsg := err.Error()
	if !strings.Contains(errMsg, "connection refused") &&
		!strings.Contains(strings.ToLower(errMsg), "api") &&
		!strings.Contains(strings.ToLower(errMsg), "project") {
		t.Errorf("error %q is not descriptive; should mention the failure cause", errMsg)
	}
}

// TestStatus_PRDsAPIError verifies that a clear error is returned when the
// project is found but the PRDs API call fails.
func TestStatus_PRDsAPIError(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestForStatus)

	api := &fakeStatusAPI{
		listProjects: []StatusProjectSummary{
			{ID: "proj-uuid", Name: "my-project"},
		},
		listPRDsErr: errors.New("unexpected status 500: internal server error"),
	}
	var out bytes.Buffer

	err := runStatus(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when ListProjectPRDs fails, got nil")
	}
}

// ---------------------------------------------------------------------------
// Tests: quiet mode
// ---------------------------------------------------------------------------

// TestStatus_QuietMode verifies that with quiet=true the output is minimal —
// only machine-readable counts without decorative labels or table formatting.
func TestStatus_QuietMode(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestForStatus)

	api := &fakeStatusAPI{
		listProjects: []StatusProjectSummary{
			{ID: "proj-quiet", Name: "my-project"},
		},
		listPRDs: []StatusPRD{
			{ID: "prd-1", Title: "Feature A", Status: "active"},
		},
		listPRs: []StatusPR{
			{ID: "pr-1", Title: "Fix bug", Status: "open"},
		},
		listEvents: []StatusEvent{
			{ID: "evt-1", EventType: "push", Message: "Pushed to main", CreatedAt: "2024-01-01T10:00:00Z"},
		},
	}

	var out bytes.Buffer
	err := runStatus(manifestPath, api, true, &out)
	if err != nil {
		t.Fatalf("runStatus (quiet) returned unexpected error: %v", err)
	}

	got := out.String()

	// Quiet mode should not include decorative table borders or long labels.
	decorators := []string{"┌", "┐", "└", "┘", "│", "─", "═"}
	for _, d := range decorators {
		if strings.Contains(got, d) {
			t.Errorf("quiet mode output should not contain table decorator %q", d)
		}
	}

	// Quiet mode must still include the numeric counts somewhere.
	if !strings.Contains(got, "1") {
		t.Errorf("quiet mode output %q should contain counts", got)
	}
}
