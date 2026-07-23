package cmd

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"devtrack/internal"
)

// fakePRSyncAPI records upserted PR bodies and can resolve a project by name.
type fakePRSyncAPI struct {
	projects  []internal.ProjectSummary
	upserts   []map[string]interface{}
	upsertErr error
}

func (f *fakePRSyncAPI) ListProjects() ([]internal.ProjectSummary, error) {
	return f.projects, nil
}

func (f *fakePRSyncAPI) UpsertPR(projectID string, body map[string]interface{}) error {
	if f.upsertErr != nil {
		return f.upsertErr
	}
	body["_project_id"] = projectID
	f.upserts = append(f.upserts, body)
	return nil
}

func strptr(s string) *string { return &s }

func TestPRStatus(t *testing.T) {
	cases := []struct {
		name string
		pr   githubPR
		want string
	}{
		{"open", githubPR{State: "open"}, "open"},
		{"draft", githubPR{State: "open", Draft: true}, "draft"},
		{"closed not merged", githubPR{State: "closed"}, "closed"},
		{"merged wins over closed", githubPR{State: "closed", MergedAt: strptr("2026-07-20T21:44:33Z")}, "merged"},
		{"empty merged_at is not merged", githubPR{State: "closed", MergedAt: strptr("")}, "closed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := prStatus(tc.pr); got != tc.want {
				t.Errorf("prStatus = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRunPRSync_UpsertsEachPRWithMappedFields(t *testing.T) {
	api := &fakePRSyncAPI{
		projects: []internal.ProjectSummary{{ID: "proj-1", Name: "devtrack"}},
	}
	identity := internal.Identity{Name: "devtrack"}
	fetch := func() ([]githubPR, error) {
		return []githubPR{
			{
				ID: 4088980291, Number: 21, Title: "fix: x",
				HTMLURL: "https://github.com/queso/DevTrack/pull/21",
				State:   "closed", MergedAt: strptr("2026-07-20T21:44:33Z"),
				CreatedAt: "2026-07-20T06:59:17Z",
				User: struct {
					Login string `json:"login"`
				}{Login: "queso"},
			},
			{
				ID: 4086602090, Number: 20, Title: "feat: y",
				HTMLURL: "https://github.com/queso/DevTrack/pull/20",
				State:   "open", CreatedAt: "2026-07-19T00:00:00Z",
				User: struct {
					Login string `json:"login"`
				}{Login: "queso"},
			},
		}, nil
	}

	var buf bytes.Buffer
	if err := runPRSync(api, identity, fetch, false, &buf); err != nil {
		t.Fatalf("runPRSync: %v", err)
	}

	if len(api.upserts) != 2 {
		t.Fatalf("expected 2 upserts, got %d", len(api.upserts))
	}
	// Big id preserved (int64, not truncated), merged status, merged_at present.
	merged := api.upserts[0]
	if merged["github_id"] != int64(4088980291) {
		t.Errorf("github_id = %v, want 4088980291", merged["github_id"])
	}
	if merged["status"] != "merged" {
		t.Errorf("status = %v, want merged", merged["status"])
	}
	if merged["merged_at"] != "2026-07-20T21:44:33Z" {
		t.Errorf("merged_at = %v", merged["merged_at"])
	}
	if merged["_project_id"] != "proj-1" {
		t.Errorf("resolved project id = %v, want proj-1", merged["_project_id"])
	}
	// Open PR carries no merged_at.
	if _, ok := api.upserts[1]["merged_at"]; ok {
		t.Errorf("open PR should not carry merged_at: %v", api.upserts[1])
	}
	if !strings.Contains(buf.String(), "Synced 2 pull request(s)") {
		t.Errorf("summary missing: %q", buf.String())
	}
}

func TestRunPRSync_UnregisteredProjectErrors(t *testing.T) {
	api := &fakePRSyncAPI{projects: []internal.ProjectSummary{{ID: "p", Name: "other"}}}
	identity := internal.Identity{Name: "not-registered"}
	fetch := func() ([]githubPR, error) { return nil, nil }

	err := runPRSync(api, identity, fetch, true, &bytes.Buffer{})
	if err == nil {
		t.Fatal("expected error for unregistered project")
	}
}

func TestRunPRSync_ContinuesOnPerPRFailure(t *testing.T) {
	api := &fakePRSyncAPI{
		projects:  []internal.ProjectSummary{{ID: "proj-1", Name: "devtrack"}},
		upsertErr: errors.New("422"),
	}
	identity := internal.Identity{Name: "devtrack"}
	fetch := func() ([]githubPR, error) {
		return []githubPR{{ID: 1, Number: 1, State: "open"}}, nil
	}

	var buf bytes.Buffer
	// Best-effort: a failing upsert is reported but does not return an error.
	if err := runPRSync(api, identity, fetch, false, &buf); err != nil {
		t.Fatalf("runPRSync should not abort on a per-PR failure: %v", err)
	}
	if !strings.Contains(buf.String(), "1 failed") {
		t.Errorf("expected failure count in summary: %q", buf.String())
	}
}
