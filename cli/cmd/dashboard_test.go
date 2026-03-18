package cmd

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"

	"devtrack/internal"
)

// ---------------------------------------------------------------------------
// Fake / test double
// ---------------------------------------------------------------------------

// fakeDashboardAPI is a controllable test double for DashboardAPI.
type fakeDashboardAPI struct {
	projects []DashboardProject
	err      error
}

func (f *fakeDashboardAPI) ListDashboardProjects() ([]DashboardProject, error) {
	return f.projects, f.err
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// daysAgo returns a UTC time that is n full days before "now" (test-stable
// because tests do not depend on the exact sub-second value).
func daysAgo(n int) time.Time {
	return time.Now().UTC().Add(-time.Duration(n) * 24 * time.Hour)
}

// ---------------------------------------------------------------------------
// Test 1: Multiple projects — each project appears in output
// ---------------------------------------------------------------------------

// TestDashboard_MultipleProjectsAreShown verifies that when the API returns
// several projects, runDashboard prints each project name to the output.
func TestDashboard_MultipleProjectsAreShown(t *testing.T) {
	api := &fakeDashboardAPI{
		projects: []DashboardProject{
			{
				Project:      internal.ProjectSummary{ID: "id-1", Name: "alpha-service"},
				ActivePRD:    "PRD-001: Auth Rework",
				LastActivity: daysAgo(0),
			},
			{
				Project:      internal.ProjectSummary{ID: "id-2", Name: "beta-api"},
				ActivePRD:    "",
				LastActivity: daysAgo(3),
			},
			{
				Project:      internal.ProjectSummary{ID: "id-3", Name: "gamma-frontend"},
				ActivePRD:    "PRD-042: Dark Mode",
				LastActivity: daysAgo(10),
			},
		},
	}

	var out bytes.Buffer
	err := runDashboard(api, false, &out)
	if err != nil {
		t.Fatalf("runDashboard returned unexpected error: %v", err)
	}

	got := out.String()
	for _, want := range []string{"alpha-service", "beta-api", "gamma-frontend"} {
		if !strings.Contains(got, want) {
			t.Errorf("output does not contain project name %q\nfull output:\n%s", want, got)
		}
	}
}

// TestDashboard_ActivePRDAppearsInOutput verifies that when a project has an
// active PRD, its title is included in the dashboard output.
func TestDashboard_ActivePRDAppearsInOutput(t *testing.T) {
	api := &fakeDashboardAPI{
		projects: []DashboardProject{
			{
				Project:      internal.ProjectSummary{ID: "id-1", Name: "alpha-service"},
				ActivePRD:    "PRD-001: Auth Rework",
				LastActivity: daysAgo(0),
			},
		},
	}

	var out bytes.Buffer
	if err := runDashboard(api, false, &out); err != nil {
		t.Fatalf("runDashboard returned unexpected error: %v", err)
	}

	got := out.String()
	if !strings.Contains(got, "PRD-001: Auth Rework") {
		t.Errorf("output does not contain active PRD title\nfull output:\n%s", got)
	}
}

// ---------------------------------------------------------------------------
// Test 2: No projects — shows "no projects" message
// ---------------------------------------------------------------------------

// TestDashboard_NoProjects verifies that when the API returns an empty slice,
// runDashboard prints a human-readable "no projects" message instead of blank
// output or an error.
func TestDashboard_NoProjects(t *testing.T) {
	api := &fakeDashboardAPI{
		projects: []DashboardProject{},
	}

	var out bytes.Buffer
	err := runDashboard(api, false, &out)
	if err != nil {
		t.Fatalf("runDashboard returned unexpected error: %v", err)
	}

	got := strings.ToLower(out.String())
	if !strings.Contains(got, "no project") {
		t.Errorf("expected a 'no projects' message in output, got:\n%s", out.String())
	}
}

// ---------------------------------------------------------------------------
// Test 3: API error — clear error is returned
// ---------------------------------------------------------------------------

// TestDashboard_APIError verifies that when ListDashboardProjects fails,
// runDashboard surfaces a non-nil error so the caller can print it.
func TestDashboard_APIError(t *testing.T) {
	api := &fakeDashboardAPI{
		err: errors.New("connection refused"),
	}

	var out bytes.Buffer
	err := runDashboard(api, false, &out)
	if err == nil {
		t.Fatal("expected error when API call fails, got nil")
	}
	if !strings.Contains(err.Error(), "connection refused") &&
		!strings.Contains(strings.ToLower(err.Error()), "dashboard") &&
		!strings.Contains(strings.ToLower(err.Error()), "project") {
		t.Errorf("error message %q is not descriptive enough", err.Error())
	}
}

// ---------------------------------------------------------------------------
// Test 4: Quiet mode — minimal output (project names only, no decorations)
// ---------------------------------------------------------------------------

// TestDashboard_QuietMode verifies that with quiet=true the output contains
// project names but none of the table headers, legends, or PRD metadata that
// appear in normal mode.
func TestDashboard_QuietMode(t *testing.T) {
	api := &fakeDashboardAPI{
		projects: []DashboardProject{
			{
				Project:      internal.ProjectSummary{ID: "id-1", Name: "alpha-service"},
				ActivePRD:    "PRD-001: Auth Rework",
				LastActivity: daysAgo(0),
			},
			{
				Project:      internal.ProjectSummary{ID: "id-2", Name: "beta-api"},
				ActivePRD:    "",
				LastActivity: daysAgo(3),
			},
		},
	}

	var out bytes.Buffer
	err := runDashboard(api, true /* quiet */, &out)
	if err != nil {
		t.Fatalf("runDashboard (quiet) returned unexpected error: %v", err)
	}

	got := out.String()

	// Project names must still appear.
	for _, name := range []string{"alpha-service", "beta-api"} {
		if !strings.Contains(got, name) {
			t.Errorf("quiet output missing project name %q\nfull output:\n%s", name, got)
		}
	}

	// Legend labels must NOT appear in quiet mode.
	for _, unwanted := range []string{"today", "this week", "stale", "legend", "Legend"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("quiet output should not contain %q\nfull output:\n%s", unwanted, got)
		}
	}
}

// ---------------------------------------------------------------------------
// Test 5: Activity age classification
// ---------------------------------------------------------------------------

// TestDashboard_ActivityClassification verifies that projects are labelled
// with the correct age category based on last-activity timestamp:
//
//   - active today  → last event today (within 24 h)
//   - this week     → last event 1–6 days ago
//   - stale         → last event 7 or more days ago
func TestDashboard_ActivityClassification(t *testing.T) {
	api := &fakeDashboardAPI{
		projects: []DashboardProject{
			{
				Project:      internal.ProjectSummary{ID: "id-today", Name: "proj-today"},
				LastActivity: time.Now().UTC().Add(-1 * time.Hour), // active today
			},
			{
				Project:      internal.ProjectSummary{ID: "id-week", Name: "proj-this-week"},
				LastActivity: daysAgo(3), // 3 days ago — this week
			},
			{
				Project:      internal.ProjectSummary{ID: "id-stale", Name: "proj-stale"},
				LastActivity: daysAgo(14), // 14 days ago — stale
			},
		},
	}

	var out bytes.Buffer
	err := runDashboard(api, false, &out)
	if err != nil {
		t.Fatalf("runDashboard returned unexpected error: %v", err)
	}

	got := out.String()

	// The output should use distinct visual markers or labels for each
	// classification tier.  We accept any of the common representations:
	// a word label, an emoji, or a symbol — whatever B.A. chooses.
	// We just require all three tiers to be represented somewhere.
	todayPatterns := []string{"today", "Today", "●", "✓"}
	weekPatterns := []string{"week", "Week", "◐", "~"}
	stalePatterns := []string{"stale", "Stale", "○", "!"}

	containsAny := func(s string, patterns []string) bool {
		for _, p := range patterns {
			if strings.Contains(s, p) {
				return true
			}
		}
		return false
	}

	if !containsAny(got, todayPatterns) {
		t.Errorf("output missing 'today' activity label\nfull output:\n%s", got)
	}
	if !containsAny(got, weekPatterns) {
		t.Errorf("output missing 'this week' activity label\nfull output:\n%s", got)
	}
	if !containsAny(got, stalePatterns) {
		t.Errorf("output missing 'stale' activity label\nfull output:\n%s", got)
	}
}

// TestDashboard_StaleThresholdBoundary verifies that a project last active
// exactly 7 days ago is classified as stale (not "this week").
func TestDashboard_StaleThresholdBoundary(t *testing.T) {
	api := &fakeDashboardAPI{
		projects: []DashboardProject{
			{
				Project:      internal.ProjectSummary{ID: "id-boundary", Name: "proj-boundary"},
				LastActivity: daysAgo(7), // exactly 7 days — should be stale
			},
		},
	}

	var out bytes.Buffer
	err := runDashboard(api, false, &out)
	if err != nil {
		t.Fatalf("runDashboard returned unexpected error: %v", err)
	}

	got := strings.ToLower(out.String())
	if !strings.Contains(got, "stale") {
		t.Errorf("project 7 days old should be labelled stale\nfull output:\n%s", out.String())
	}
}
