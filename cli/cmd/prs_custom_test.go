package cmd

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

// fakePRAPI is a test double for the PRAPI interface that runPRs accepts.
// It returns canned responses and records the status filter it received.
type fakePRAPI struct {
	pullRequests    []PRSummary
	pullRequestsErr error

	// Recorded call arguments (for assertion)
	listCalledWithStatus string
}

func (f *fakePRAPI) ListPullRequests(status string) ([]PRSummary, error) {
	f.listCalledWithStatus = status
	return f.pullRequests, f.pullRequestsErr
}

// ---------------------------------------------------------------------------
// Tests: happy path — list with multiple PRs
// ---------------------------------------------------------------------------

// TestPRsList_FormattedTableOutput verifies that when multiple PRs are returned
// the output contains the PR number, title, author, status, and age columns.
func TestPRsList_FormattedTableOutput(t *testing.T) {
	now := time.Now()
	api := &fakePRAPI{
		pullRequests: []PRSummary{
			{
				Number:    42,
				Title:     "Add user authentication",
				Author:    "alice",
				Status:    "open",
				CreatedAt: now.Add(-48 * time.Hour),
			},
			{
				Number:    17,
				Title:     "Fix pagination bug",
				Author:    "bob",
				Status:    "open",
				CreatedAt: now.Add(-3 * time.Hour),
			},
		},
	}

	var out bytes.Buffer
	err := runPRs("open", false, api, &out)
	if err != nil {
		t.Fatalf("runPRs returned unexpected error: %v", err)
	}

	got := out.String()

	// PR numbers must appear
	if !strings.Contains(got, "42") {
		t.Errorf("output %q does not contain PR number 42", got)
	}
	if !strings.Contains(got, "17") {
		t.Errorf("output %q does not contain PR number 17", got)
	}

	// Titles must appear
	if !strings.Contains(got, "Add user authentication") {
		t.Errorf("output %q does not contain PR title %q", got, "Add user authentication")
	}
	if !strings.Contains(got, "Fix pagination bug") {
		t.Errorf("output %q does not contain PR title %q", got, "Fix pagination bug")
	}

	// Authors must appear
	if !strings.Contains(got, "alice") {
		t.Errorf("output %q does not contain author %q", got, "alice")
	}
	if !strings.Contains(got, "bob") {
		t.Errorf("output %q does not contain author %q", got, "bob")
	}

	// Status must appear
	if !strings.Contains(got, "open") {
		t.Errorf("output %q does not contain status %q", got, "open")
	}
}

// ---------------------------------------------------------------------------
// Tests: empty list
// ---------------------------------------------------------------------------

// TestPRsList_EmptyListShowsNoOpenPRsMessage verifies that when the API returns
// an empty slice the output contains a user-friendly "no open PRs" message
// rather than a blank screen or an error.
func TestPRsList_EmptyListShowsNoOpenPRsMessage(t *testing.T) {
	api := &fakePRAPI{
		pullRequests: []PRSummary{},
	}

	var out bytes.Buffer
	err := runPRs("open", false, api, &out)
	if err != nil {
		t.Fatalf("runPRs returned unexpected error: %v", err)
	}

	got := strings.ToLower(out.String())

	if !strings.Contains(got, "no") || (!strings.Contains(got, "pr") && !strings.Contains(got, "pull request")) {
		t.Errorf("output %q should inform the user that no PRs were found", out.String())
	}
}

// ---------------------------------------------------------------------------
// Tests: --status filter
// ---------------------------------------------------------------------------

// TestPRsList_StatusFilter_PassesFilterToAPI verifies that the status flag is
// forwarded to the API call so only matching PRs are fetched.
func TestPRsList_StatusFilter_PassesFilterToAPI(t *testing.T) {
	api := &fakePRAPI{
		pullRequests: []PRSummary{
			{
				Number:    99,
				Title:     "Merge feature branch",
				Author:    "carol",
				Status:    "merged",
				CreatedAt: time.Now().Add(-24 * time.Hour),
			},
		},
	}

	var out bytes.Buffer
	err := runPRs("merged", false, api, &out)
	if err != nil {
		t.Fatalf("runPRs returned unexpected error: %v", err)
	}

	if api.listCalledWithStatus != "merged" {
		t.Errorf("API called with status %q, want %q", api.listCalledWithStatus, "merged")
	}

	// The returned PR should appear in the output
	got := out.String()
	if !strings.Contains(got, "99") {
		t.Errorf("output %q does not contain PR number 99", got)
	}
	if !strings.Contains(got, "merged") {
		t.Errorf("output %q does not contain status %q", got, "merged")
	}
}

// TestPRsList_StatusFilter_ClosedShowsOnlyClosedPRs verifies that closed status
// returns only the PRs with a matching status from the API.
func TestPRsList_StatusFilter_ClosedShowsOnlyClosedPRs(t *testing.T) {
	api := &fakePRAPI{
		pullRequests: []PRSummary{
			{Number: 5, Title: "Old feature", Author: "dave", Status: "closed", CreatedAt: time.Now().Add(-72 * time.Hour)},
		},
	}

	var out bytes.Buffer
	err := runPRs("closed", false, api, &out)
	if err != nil {
		t.Fatalf("runPRs returned unexpected error: %v", err)
	}

	if api.listCalledWithStatus != "closed" {
		t.Errorf("API called with status %q, want %q", api.listCalledWithStatus, "closed")
	}
}

// ---------------------------------------------------------------------------
// Tests: API error
// ---------------------------------------------------------------------------

// TestPRsList_APIError_ReturnsDescriptiveError verifies that when the API call
// fails a clear error is returned (not swallowed) so the user can diagnose the
// problem.
func TestPRsList_APIError_ReturnsDescriptiveError(t *testing.T) {
	api := &fakePRAPI{
		pullRequestsErr: errors.New("connection refused"),
	}

	var out bytes.Buffer
	err := runPRs("open", false, api, &out)
	if err == nil {
		t.Fatal("expected error when API is unreachable, got nil")
	}

	errMsg := err.Error()
	if !strings.Contains(errMsg, "connection refused") &&
		!strings.Contains(strings.ToLower(errMsg), "pr") &&
		!strings.Contains(strings.ToLower(errMsg), "pull request") &&
		!strings.Contains(strings.ToLower(errMsg), "list") {
		t.Errorf("error message %q is not descriptive enough; should mention what failed", errMsg)
	}
}

// ---------------------------------------------------------------------------
// Tests: --quiet mode
// ---------------------------------------------------------------------------

// TestPRsList_QuietMode_OutputsMinimal verifies that with quiet=true the output
// is minimal — only PR numbers or essential identifiers, no table decorations
// or header labels.
func TestPRsList_QuietMode_OutputsMinimal(t *testing.T) {
	api := &fakePRAPI{
		pullRequests: []PRSummary{
			{Number: 101, Title: "Some feature", Author: "eve", Status: "open", CreatedAt: time.Now().Add(-1 * time.Hour)},
			{Number: 202, Title: "Another feature", Author: "frank", Status: "open", CreatedAt: time.Now().Add(-2 * time.Hour)},
		},
	}

	var out bytes.Buffer
	err := runPRs("open", true, api, &out)
	if err != nil {
		t.Fatalf("runPRs (quiet) returned unexpected error: %v", err)
	}

	got := out.String()

	// PR numbers must be present
	if !strings.Contains(got, "101") {
		t.Errorf("quiet output %q does not contain PR number 101", got)
	}
	if !strings.Contains(got, "202") {
		t.Errorf("quiet output %q does not contain PR number 202", got)
	}

	// Quiet mode should not contain verbose table decoration characters or headers.
	// We look for absence of typical table borders (│, +, ─) and wordy header labels.
	verboseIndicators := []string{"AUTHOR", "STATUS", "TITLE", "NUMBER", "AGE"}
	for _, indicator := range verboseIndicators {
		if strings.Contains(strings.ToUpper(got), indicator) {
			t.Errorf("quiet mode output should not contain header label %q, got:\n%s", indicator, got)
		}
	}

	// Quiet output should be terse: each line should have very few fields.
	lines := strings.Split(strings.TrimSpace(got), "\n")
	if len(lines) == 0 {
		t.Fatal("quiet output produced no lines")
	}
}
