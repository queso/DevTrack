package cmd

// WI-044: Tests for `devtrack ideas promote <id>` subcommand.
//
// Expected interface in ideas_promote.go:
//
//   type PromoteIdeaAPI interface {
//       PromoteIdea(id string) ([]byte, error)  // PATCH /api/v1/ideas/:id {"status":"promoted"}
//   }
//
//   func runPromoteIdea(ideaID string, manifestPath string, api PromoteIdeaAPI, jsonMode bool, out io.Writer) error
//   func slugify(title string) string

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Fake
// ---------------------------------------------------------------------------

type fakePromoteAPI struct {
	respBody []byte
	err      error
	calledID string
}

func (f *fakePromoteAPI) PromoteIdea(id string) ([]byte, error) {
	f.calledID = id
	return f.respBody, f.err
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// writeDraftManifest creates a project.yaml with draft_path set.
func writeDraftManifest(t *testing.T, dir, draftPath string) string {
	t.Helper()
	content := "name: my-project\nworkflow: sdlc\n"
	if draftPath != "" {
		content += "draft_path: " + draftPath + "\n"
	}
	return writeManifest(t, dir, content)
}

// promotedIdeaJSON returns a canned API response for a promoted idea.
func promotedIdeaJSON(id, title string, tags []string) []byte {
	tagJSON := "[]"
	if len(tags) > 0 {
		quoted := make([]string, len(tags))
		for i, tag := range tags {
			quoted[i] = `"` + tag + `"`
		}
		tagJSON = "[" + strings.Join(quoted, ",") + "]"
	}
	return []byte(`{"id":"` + id + `","title":"` + title + `","tags":` + tagJSON + `,"status":"promoted"}`)
}

// ---------------------------------------------------------------------------
// WI-044 tests
// ---------------------------------------------------------------------------

// TestPromoteIdea_CreatesFileAtDraftPath verifies that on success, a markdown
// file is created at draft_path/<slug>.md relative to the manifest directory.
func TestPromoteIdea_CreatesFileAtDraftPath(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	api := &fakePromoteAPI{
		respBody: promotedIdeaJSON("idea-1", "My Great Post", []string{"blog"}),
	}

	var out bytes.Buffer
	if err := runPromoteIdea("idea-1", manifestPath, api, false, &out); err != nil {
		t.Fatalf("runPromoteIdea returned unexpected error: %v", err)
	}

	if api.calledID != "idea-1" {
		t.Errorf("PromoteIdea called with id %q, want %q", api.calledID, "idea-1")
	}

	// A file should exist in the draft directory.
	entries, err := os.ReadDir(draftDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 file in draft_path, got %d", len(entries))
	}
	if !strings.HasSuffix(entries[0].Name(), ".md") {
		t.Errorf("draft file %q should have .md extension", entries[0].Name())
	}
}

// TestPromoteIdea_FrontmatterContainsTitleTagsDate verifies that the created
// markdown file contains YAML frontmatter with title, tags, and a date field.
func TestPromoteIdea_FrontmatterContainsTitleTagsDate(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	api := &fakePromoteAPI{
		respBody: promotedIdeaJSON("idea-2", "AI Tooling Roundup", []string{"ai", "tools"}),
	}

	var out bytes.Buffer
	if err := runPromoteIdea("idea-2", manifestPath, api, false, &out); err != nil {
		t.Fatalf("runPromoteIdea returned unexpected error: %v", err)
	}

	entries, _ := os.ReadDir(draftDir)
	if len(entries) == 0 {
		t.Fatal("expected draft file to be created, got none")
	}
	content, err := os.ReadFile(filepath.Join(draftDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	fileStr := string(content)
	if !strings.Contains(fileStr, "---") {
		t.Error("draft file should contain YAML frontmatter delimiters (---)")
	}
	if !strings.Contains(fileStr, "AI Tooling Roundup") {
		t.Errorf("frontmatter should contain idea title, got:\n%s", fileStr)
	}
	// Tags should be present
	if !strings.Contains(fileStr, "ai") || !strings.Contains(fileStr, "tools") {
		t.Errorf("frontmatter should contain tags [ai tools], got:\n%s", fileStr)
	}
	// A date/created field should be present
	lowerFile := strings.ToLower(fileStr)
	if !strings.Contains(lowerFile, "date") && !strings.Contains(lowerFile, "created") {
		t.Errorf("frontmatter should contain a date or created field, got:\n%s", fileStr)
	}
}

// TestPromoteIdea_SlugDerivedFromTitle verifies that the filename is a slug
// generated from the idea title (lowercase, spaces→hyphens, non-alphanumeric stripped).
func TestPromoteIdea_SlugDerivedFromTitle(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	api := &fakePromoteAPI{
		respBody: promotedIdeaJSON("idea-3", "Hello World! (2024)", []string{}),
	}

	var out bytes.Buffer
	if err := runPromoteIdea("idea-3", manifestPath, api, false, &out); err != nil {
		t.Fatalf("runPromoteIdea returned unexpected error: %v", err)
	}

	entries, _ := os.ReadDir(draftDir)
	if len(entries) == 0 {
		t.Fatal("expected draft file to be created")
	}
	filename := entries[0].Name()

	// Filename must be lowercase, hyphen-separated, no special chars.
	if strings.ToLower(filename) != filename {
		t.Errorf("slug filename %q should be lowercase", filename)
	}
	if strings.Contains(filename, " ") {
		t.Errorf("slug filename %q should not contain spaces", filename)
	}
	if strings.Contains(filename, "!") || strings.Contains(filename, "(") || strings.Contains(filename, ")") {
		t.Errorf("slug filename %q should not contain special characters", filename)
	}
	// Should contain "hello" and "world"
	if !strings.Contains(filename, "hello") || !strings.Contains(filename, "world") {
		t.Errorf("slug filename %q should contain words from title", filename)
	}
}

// TestPromoteIdea_NoDraftPath_ReturnsError verifies that when draft_path is
// not set in project.yaml, the command returns a clear error.
func TestPromoteIdea_NoDraftPath_ReturnsError(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeDraftManifest(t, dir, "") // no draft_path

	api := &fakePromoteAPI{
		respBody: promotedIdeaJSON("idea-4", "Some Idea", []string{}),
	}

	var out bytes.Buffer
	err := runPromoteIdea("idea-4", manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when draft_path not set, got nil")
	}

	// Error must explain that draft_path is required.
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "draft_path") && !strings.Contains(msg, "draft path") {
		t.Errorf("error %q should mention draft_path", err.Error())
	}
}

// TestPromoteIdea_IdeaNotFound_ReturnsError verifies that a 404 from the API
// produces a not-found error.
func TestPromoteIdea_IdeaNotFound_ReturnsError(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifestPath := writeDraftManifest(t, dir, "drafts")

	api := &fakePromoteAPI{
		err: errors.New("unexpected status 404: idea not found"),
	}

	var out bytes.Buffer
	err := runPromoteIdea("nonexistent-id", manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error for 404 response, got nil")
	}

	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "404") && !strings.Contains(msg, "not found") {
		t.Errorf("error %q should indicate the idea was not found", err.Error())
	}
}

// TestPromoteIdea_ExistingFile_WarnsAndDoesNotOverwrite verifies that when a
// draft file already exists at the target path, the command does not overwrite
// it and prints a warning instead.
func TestPromoteIdea_ExistingFile_WarnsAndDoesNotOverwrite(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Pre-create the file that would be the target.
	existingContent := "# existing content — must not be overwritten\n"
	slug := slugify("My Idea")
	existingPath := filepath.Join(draftDir, slug+".md")
	if err := os.WriteFile(existingPath, []byte(existingContent), 0o644); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	api := &fakePromoteAPI{
		respBody: promotedIdeaJSON("idea-5", "My Idea", []string{}),
	}

	var out bytes.Buffer
	// Should succeed (not error), but print a warning.
	if err := runPromoteIdea("idea-5", manifestPath, api, false, &out); err != nil {
		t.Fatalf("runPromoteIdea should not error when file already exists, got: %v", err)
	}

	// File content must be unchanged.
	got, err := os.ReadFile(existingPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != existingContent {
		t.Errorf("existing draft file was overwritten; got:\n%s\nwant:\n%s", string(got), existingContent)
	}

	// Output should warn the user.
	outStr := strings.ToLower(out.String())
	if !strings.Contains(outStr, "warn") && !strings.Contains(outStr, "exist") && !strings.Contains(outStr, "skip") {
		t.Errorf("output %q should warn about the existing file", out.String())
	}
}

// TestPromoteIdea_JSONMode_OutputsRawJSON verifies that --json outputs the
// raw API response without any additional formatting.
func TestPromoteIdea_JSONMode_OutputsRawJSON(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	rawResp := promotedIdeaJSON("idea-6", "JSON Test", []string{"test"})
	api := &fakePromoteAPI{respBody: rawResp}

	var out bytes.Buffer
	if err := runPromoteIdea("idea-6", manifestPath, api, true /* jsonMode */, &out); err != nil {
		t.Fatalf("runPromoteIdea (json) returned unexpected error: %v", err)
	}

	got := strings.TrimSpace(out.String())
	if !strings.Contains(got, `"id":"idea-6"`) {
		t.Errorf("json output %q should contain raw API response", got)
	}
}

// ---------------------------------------------------------------------------
// slugify unit tests (tests the helper function directly)
// ---------------------------------------------------------------------------

func TestSlugify(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"Hello World", "hello-world"},
		{"AI Tooling 2024", "ai-tooling-2024"},
		{"Hello World! (2024)", "hello-world-2024"},
		{"  spaces  around  ", "spaces-around"},
		{"already-slug", "already-slug"},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got := slugify(tc.input)
			if got != tc.want {
				t.Errorf("slugify(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

// TestPromoteIdea_EmptySlug_ReturnsError verifies that a title producing an
// empty slug (e.g. all special characters) returns a descriptive error and
// does not create a hidden .md file.
func TestPromoteIdea_EmptySlug_ReturnsError(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	api := &fakePromoteAPI{
		respBody: promotedIdeaJSON("idea-empty", "!!!", []string{}),
	}

	var out bytes.Buffer
	err := runPromoteIdea("idea-empty", manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error for title that produces empty slug, got nil")
	}
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "slug") && !strings.Contains(msg, "title") {
		t.Errorf("error %q should mention slug or title", err.Error())
	}

	// No .md file should have been created.
	entries, _ := os.ReadDir(draftDir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".md") {
			t.Errorf("no .md file should be created for empty slug, but found %q", e.Name())
		}
	}
}

// TestPromoteIdea_TagsWithQuotes_ValidFrontmatter verifies that tags containing
// double-quote characters are safely escaped in the YAML frontmatter.
func TestPromoteIdea_TagsWithQuotes_ValidFrontmatter(t *testing.T) {
	dir := t.TempDir()
	draftDir := filepath.Join(dir, "drafts")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatal(err)
	}

	manifestPath := writeDraftManifest(t, dir, "drafts")
	// Tag contains a double-quote — must be escaped in YAML output.
	// Use a raw JSON literal with proper backslash escaping.
	rawResp := []byte(`{"id":"idea-q","title":"Go \"lang\"","tags":["go\"lang"],"status":"promoted"}`)
	api := &fakePromoteAPI{respBody: rawResp}

	var out bytes.Buffer
	if err := runPromoteIdea("idea-q", manifestPath, api, false, &out); err != nil {
		t.Fatalf("runPromoteIdea returned unexpected error: %v", err)
	}

	entries, _ := os.ReadDir(draftDir)
	if len(entries) == 0 {
		t.Fatal("expected draft file to be created")
	}
	content, err := os.ReadFile(filepath.Join(draftDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	// The raw unescaped tag must not appear as a bare unquoted value that would
	// break YAML parsing (a bare `"` inside an unquoted string is invalid).
	// We check that the file does not contain the raw string go"lang outside of
	// proper quoting by verifying it's not present as-is between [ and ].
	fileStr := string(content)
	if strings.Contains(fileStr, `[go"lang]`) {
		t.Errorf("frontmatter contains unescaped tag value; got:\n%s", fileStr)
	}
}
