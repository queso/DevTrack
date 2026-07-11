package cmd

// WI-045: Tests for content_path and draft_path scanning in sync command.
// These tests assume FullSyncAPI gains a SyncContent method:
//
//   SyncContent(projectID string, items []map[string]interface{}) (int, error)
//
// And that runSync is extended to:
//  - Scan manifest.ContentPath for *.md files and call SyncContent with status "published"
//  - Scan manifest.DraftPath for *.md files and call SyncContent with status "draft"
//  - Print a warning (not an error) when a configured path does not exist
//  - Include the content item count in the sync summary output

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"devtrack/internal"
)

// ---------------------------------------------------------------------------
// Fake for the extended FullSyncAPI (includes SyncContent)
// ---------------------------------------------------------------------------

// fakeFullSyncWithContent implements the extended FullSyncAPI (FullSyncAPI +
// SyncContent). Used only in sync_content_test.go to avoid coupling with the
// fakeSyncAPIFull defined in sync_test.go.
type fakeFullSyncWithContent struct {
	// ListProjects
	listProjects    []internal.ProjectSummary
	listProjectsErr error

	// SyncPullRequests
	syncResponseBody []byte
	syncErr          error

	// UpdateProject
	updateProjectID  string
	updateProjectErr error

	// SyncPRDs
	syncPRDsCount int
	syncPRDsErr   error

	// SyncContent (new)
	syncContentCount     int
	syncContentErr       error
	syncContentCalled    bool
	syncContentProjectID string
	syncContentItems     []map[string]interface{}
}

func (f *fakeFullSyncWithContent) ListProjects() ([]internal.ProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeFullSyncWithContent) SyncPullRequests(projectID string) ([]byte, error) {
	if f.syncResponseBody == nil {
		return []byte(`{"synced":0,"created":0,"updated":0,"closed":0}`), f.syncErr
	}
	return f.syncResponseBody, f.syncErr
}

func (f *fakeFullSyncWithContent) UpdateProject(id string, body map[string]interface{}) ([]byte, error) {
	if f.updateProjectErr != nil {
		return nil, f.updateProjectErr
	}
	return []byte(`{"id":"` + f.updateProjectID + `"}`), nil
}

func (f *fakeFullSyncWithContent) SyncPRDs(projectID string, prds []map[string]interface{}) (int, error) {
	return f.syncPRDsCount, f.syncPRDsErr
}

func (f *fakeFullSyncWithContent) SyncContent(projectID string, items []map[string]interface{}) (int, error) {
	f.syncContentCalled = true
	f.syncContentProjectID = projectID
	f.syncContentItems = append(f.syncContentItems, items...)
	return f.syncContentCount, f.syncContentErr
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// contentSyncProject is a pre-registered project used across content sync tests.
var contentSyncProject = internal.ProjectSummary{
	ID:      "proj-content-uuid",
	Name:    "content-project",
	RepoURL: "https://github.com/example/content-project",
}

// writeContentManifest creates a devtrack.yaml with content_path and/or
// draft_path fields set.
func writeContentManifest(t *testing.T, dir, contentPath, draftPath string) string {
	t.Helper()
	content := "name: content-project\nworkflow: sdlc\n"
	if contentPath != "" {
		content += "content_path: " + contentPath + "\n"
	}
	if draftPath != "" {
		content += "draft_path: " + draftPath + "\n"
	}
	return writeManifest(t, dir, content)
}

// writeMarkdownFile creates a .md file in dir with the given filename and body.
func writeMarkdownFile(t *testing.T, dir, filename, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, filename), []byte(body), 0o644); err != nil {
		t.Fatalf("writeMarkdownFile: %v", err)
	}
}

// ---------------------------------------------------------------------------
// WI-045 tests
// ---------------------------------------------------------------------------

// TestSync_ContentPath_ScansAndCallsSyncContent verifies that when content_path
// is set in the manifest, runSync scans that directory and calls SyncContent
// with the found items.
func TestSync_ContentPath_ScansAndCallsSyncContent(t *testing.T) {
	dir := t.TempDir()
	contentDir := filepath.Join(dir, "content")
	if err := os.MkdirAll(contentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeMarkdownFile(t, contentDir, "post-one.md", "# Hello World\n\nFirst post.\n")
	writeMarkdownFile(t, contentDir, "post-two.md", "# Second Post\n\nSecond post.\n")

	manifestPath := writeContentManifest(t, dir, "content", "")

	api := &fakeFullSyncWithContent{
		listProjects:    []internal.ProjectSummary{contentSyncProject},
		updateProjectID: contentSyncProject.ID,
		syncContentCount: 2,
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	if !api.syncContentCalled {
		t.Error("expected SyncContent to be called when content_path has markdown files, but it was not")
	}
	if api.syncContentProjectID != contentSyncProject.ID {
		t.Errorf("SyncContent called with project ID %q, want %q", api.syncContentProjectID, contentSyncProject.ID)
	}
	if len(api.syncContentItems) != 2 {
		t.Errorf("SyncContent called with %d items, want 2", len(api.syncContentItems))
	}
}

// TestSync_ContentItems_HaveRequiredFields verifies that scanned content items
// include title (from H1), source_path, and status derived from the directory
// (content_path → "published").
func TestSync_ContentItems_HaveRequiredFields(t *testing.T) {
	dir := t.TempDir()
	contentDir := filepath.Join(dir, "content")
	if err := os.MkdirAll(contentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeMarkdownFile(t, contentDir, "my-post.md", "# My Great Post\n\nBody text.\n")

	manifestPath := writeContentManifest(t, dir, "content", "")

	api := &fakeFullSyncWithContent{
		listProjects:    []internal.ProjectSummary{contentSyncProject},
		updateProjectID: contentSyncProject.ID,
		syncContentCount: 1,
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	if len(api.syncContentItems) != 1 {
		t.Fatalf("expected 1 content item, got %d", len(api.syncContentItems))
	}
	item := api.syncContentItems[0]

	if item["title"] != "My Great Post" {
		t.Errorf("item title = %q, want %q", item["title"], "My Great Post")
	}
	if item["source_path"] != "my-post.md" {
		t.Errorf("item source_path = %q, want %q", item["source_path"], "my-post.md")
	}
	// Status for content_path items should indicate published content.
	status, _ := item["status"].(string)
	if status == "" {
		t.Error("item should have a non-empty status field")
	}
	if strings.Contains(status, "draft") {
		t.Errorf("content_path item status %q should not be draft (only draft_path items should have draft status)", status)
	}
}

// TestSync_DraftPath_ItemsHaveDraftStatus verifies that markdown files scanned
// from draft_path are given a "draft" status.
func TestSync_DraftPath_ItemsHaveDraftStatus(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeMarkdownFile(t, draftDir, "wip-post.md", "# Work In Progress\n\nNot done yet.\n")

	manifestPath := writeContentManifest(t, dir, "", "drafts")

	api := &fakeFullSyncWithContent{
		listProjects:    []internal.ProjectSummary{contentSyncProject},
		updateProjectID: contentSyncProject.ID,
		syncContentCount: 1,
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	if len(api.syncContentItems) != 1 {
		t.Fatalf("expected 1 draft item, got %d", len(api.syncContentItems))
	}
	item := api.syncContentItems[0]

	status, _ := item["status"].(string)
	if !strings.Contains(strings.ToLower(status), "draft") {
		t.Errorf("draft_path item status = %q, want a value containing \"draft\"", status)
	}
}

// TestSync_NoContentPaths_SkipsContentScanWithoutError verifies that when
// neither content_path nor draft_path is configured, sync runs without error
// and does not call SyncContent.
func TestSync_NoContentPaths_SkipsContentScanWithoutError(t *testing.T) {
	dir := t.TempDir()
	// Manifest with no content_path or draft_path
	manifestPath := writeManifest(t, dir, `
name: content-project
workflow: sdlc
`)

	api := &fakeFullSyncWithContent{
		listProjects:    []internal.ProjectSummary{contentSyncProject},
		updateProjectID: contentSyncProject.ID,
	}

	var out bytes.Buffer
	err := runSync(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runSync returned unexpected error when content paths absent: %v", err)
	}

	if api.syncContentCalled {
		t.Error("expected SyncContent NOT to be called when content_path and draft_path are absent, but it was")
	}
}

// TestSync_ContentPath_NonexistentDirectory_WarnsAndContinues verifies that
// when content_path points to a directory that does not exist, runSync prints
// a warning and continues (does not return an error).
func TestSync_ContentPath_NonexistentDirectory_WarnsAndContinues(t *testing.T) {
	dir := t.TempDir()
	// content_path points to a directory that does not exist
	manifestPath := writeContentManifest(t, dir, "nonexistent-content-dir", "")

	api := &fakeFullSyncWithContent{
		listProjects:    []internal.ProjectSummary{contentSyncProject},
		updateProjectID: contentSyncProject.ID,
	}

	var out bytes.Buffer
	err := runSync(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runSync should not return error for nonexistent content_path, got: %v", err)
	}

	// Output should contain a warning about the missing directory.
	outStr := strings.ToLower(out.String())
	if !strings.Contains(outStr, "warn") && !strings.Contains(outStr, "not found") &&
		!strings.Contains(outStr, "nonexistent") && !strings.Contains(outStr, "skip") {
		t.Errorf("output %q should warn about the nonexistent content_path directory", out.String())
	}
}

// TestSync_Summary_IncludesContentCount verifies that the sync summary output
// includes the number of content items synced alongside PRD and PR counts.
func TestSync_Summary_IncludesContentCount(t *testing.T) {
	dir := t.TempDir()
	contentDir := filepath.Join(dir, "content")
	if err := os.MkdirAll(contentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeMarkdownFile(t, contentDir, "post-a.md", "# Post A\n")
	writeMarkdownFile(t, contentDir, "post-b.md", "# Post B\n")
	writeMarkdownFile(t, contentDir, "post-c.md", "# Post C\n")

	manifestPath := writeContentManifest(t, dir, "content", "")

	api := &fakeFullSyncWithContent{
		listProjects:     []internal.ProjectSummary{contentSyncProject},
		updateProjectID:  contentSyncProject.ID,
		syncContentCount: 3,
		syncResponseBody: []byte(`{"synced":1,"created":1,"updated":0,"closed":0}`),
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	// Summary must include the content count (3) and mention content items.
	outStr := out.String()
	if !strings.Contains(outStr, "3") {
		t.Errorf("output %q should include content count (3)", outStr)
	}
	lowerOut := strings.ToLower(outStr)
	if !strings.Contains(lowerOut, "content") && !strings.Contains(lowerOut, "article") && !strings.Contains(lowerOut, "item") {
		t.Errorf("output %q should mention content items in summary", outStr)
	}
}
