package cmd

// swagger-jack:custom:start pr-sync
// `devtrack pr-sync` fetches the current repository's pull requests from GitHub
// (via the `gh` CLI) and upserts them into DevTrack. It resolves the project
// from the working directory the same way the event hooks do (devtrack.yaml ->
// git remote -> folder name), so no manifest is required. The repository must
// already be registered — any devtrack event (a commit hook, a session start)
// auto-registers it.
// swagger-jack:custom:end

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"

	"devtrack/internal"
	"devtrack/internal/client"
	"devtrack/internal/response"

	"github.com/spf13/cobra"
)

// prSyncAPI is the subset of the API that runPRSync needs.
type prSyncAPI interface {
	ListProjects() ([]internal.ProjectSummary, error)
	UpsertPR(projectID string, body map[string]interface{}) error
}

type apiPRSyncClient struct {
	c *client.Client
}

func (a *apiPRSyncClient) ListProjects() ([]internal.ProjectSummary, error) {
	resp, err := a.c.Do("GET", "/projects", map[string]string{}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, err
	}
	var projects []internal.ProjectSummary
	if err := response.UnmarshalPaginated(resp, &projects); err != nil {
		return nil, fmt.Errorf("parse projects list: %w", err)
	}
	return projects, nil
}

func (a *apiPRSyncClient) UpsertPR(projectID string, body map[string]interface{}) error {
	_, err := a.c.Do("POST", "/projects/{id}/prs", map[string]string{"id": projectID}, map[string]string{}, body)
	return err
}

// githubPR is the subset of the GitHub REST pulls object pr-sync consumes.
type githubPR struct {
	ID      int64  `json:"id"`
	Number  int    `json:"number"`
	Title   string `json:"title"`
	HTMLURL string `json:"html_url"`
	State   string `json:"state"`
	Draft   bool   `json:"draft"`
	User    struct {
		Login string `json:"login"`
	} `json:"user"`
	CreatedAt string  `json:"created_at"`
	MergedAt  *string `json:"merged_at"`
}

// prStatus maps a GitHub PR's state to DevTrack's PullRequestStatus. merged
// wins over closed (a merged PR reports state "closed" with a merged_at).
func prStatus(pr githubPR) string {
	if pr.MergedAt != nil && *pr.MergedAt != "" {
		return "merged"
	}
	if pr.State == "closed" {
		return "closed"
	}
	if pr.Draft {
		return "draft"
	}
	return "open"
}

// fetchGitHubPRs returns the current repository's pull requests via `gh api`.
// gh fills {owner}/{repo} from the working directory's remote and handles auth.
// It is a package var so tests can substitute a fixture without invoking gh.
var fetchGitHubPRs = func() ([]githubPR, error) {
	out, err := exec.Command("gh", "api", "repos/{owner}/{repo}/pulls?state=all&per_page=100").Output()
	if err != nil {
		return nil, fmt.Errorf("gh api pulls (is gh installed and authenticated, in a GitHub repo?): %w", err)
	}
	var prs []githubPR
	if err := json.Unmarshal(out, &prs); err != nil {
		return nil, fmt.Errorf("parse gh pulls output: %w", err)
	}
	return prs, nil
}

// runPRSync is the testable core: resolve the project, fetch PRs, upsert each.
// A single PR that fails to upsert does not abort the run (best-effort sync).
func runPRSync(api prSyncAPI, identity internal.Identity, fetch func() ([]githubPR, error), quiet bool, out io.Writer) error {
	projectID, err := internal.ResolveProjectID(api, &internal.Manifest{Name: identity.Name, RepoURL: identity.RepoURL})
	if err != nil {
		return fmt.Errorf("project %q is not registered with DevTrack — send a devtrack event first: %w", identity.Name, err)
	}

	prs, err := fetch()
	if err != nil {
		return err
	}

	synced, failed := 0, 0
	for _, pr := range prs {
		body := map[string]interface{}{
			"github_id": pr.ID,
			"number":    pr.Number,
			"title":     pr.Title,
			"url":       pr.HTMLURL,
			"author":    pr.User.Login,
			"status":    prStatus(pr),
			"opened_at": pr.CreatedAt,
		}
		if pr.MergedAt != nil && *pr.MergedAt != "" {
			body["merged_at"] = *pr.MergedAt
		}
		if err := api.UpsertPR(projectID, body); err != nil {
			failed++
			if !quiet {
				fmt.Fprintf(out, "  PR #%d: %v\n", pr.Number, err)
			}
			continue
		}
		synced++
	}

	if !quiet {
		fmt.Fprintf(out, "Synced %d pull request(s) for %s", synced, identity.Name)
		if failed > 0 {
			fmt.Fprintf(out, " (%d failed)", failed)
		}
		fmt.Fprintln(out)
	}
	return nil
}

var prSyncQuiet bool

var prSyncCmd = &cobra.Command{
	Use:   "pr-sync",
	Short: "Sync the current repository's GitHub pull requests into DevTrack",
	Long: "Fetch pull requests for the current repository via the GitHub CLI (gh) " +
		"and upsert them into DevTrack. Requires gh to be installed and authenticated. " +
		"The repository must already be registered — any devtrack event auto-registers it.",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dir, _ := os.Getwd()
		identity, _ := internal.ResolveIdentity(dir, defaultGetGitURL)
		baseURL, _ := rootCmd.PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		api := &apiPRSyncClient{c: client.NewClient(baseURL, token)}
		return runPRSync(api, identity, fetchGitHubPRs, prSyncQuiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(prSyncCmd)
	prSyncCmd.Flags().BoolVar(&prSyncQuiet, "quiet", false, "Suppress output")
}
