package cmd

// swagger-jack:custom:start sync
// This file implements the `devtrack sync` command, which reads a project.yaml
// from the current directory, resolves the project ID via the API, and triggers
// a server-side pull-request sync for that project.
// swagger-jack:custom:end

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"devtrack/internal"
	"devtrack/internal/client"
	"devtrack/internal/response"

	"github.com/spf13/cobra"
)

// SyncAPI is the interface that runSync uses to trigger a server-side PR sync.
type SyncAPI interface {
	// ListProjects returns all registered projects so the manifest name/URL can
	// be resolved to a project ID.
	ListProjects() ([]internal.ProjectSummary, error)

	// SyncPullRequests triggers a server-side PR sync for the given project and
	// returns the raw JSON response body on success.
	SyncPullRequests(projectID string) ([]byte, error)
}

// apiSyncClient adapts the HTTP client to satisfy SyncAPI.
type apiSyncClient struct {
	c *client.Client
}

func (a *apiSyncClient) ListProjects() ([]internal.ProjectSummary, error) {
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

func (a *apiSyncClient) SyncPullRequests(projectID string) ([]byte, error) {
	return a.c.Do("POST", "/projects/{id}/sync-pull-requests", map[string]string{"id": projectID}, map[string]string{}, nil)
}

// runSync is the testable core of the sync command. It reads the manifest at
// manifestPath, resolves the project ID via the API, triggers a server-side
// pull-request sync, and writes a result summary to out. When quiet is true,
// only a minimal confirmation line is written.
func runSync(manifestPath string, api SyncAPI, quiet bool, out io.Writer) error {
	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return err
	}

	projectID, err := internal.ResolveProjectID(api, manifest)
	if err != nil {
		return fmt.Errorf("project %q not found — run `devtrack register` first: %w", manifest.Name, err)
	}

	resp, err := api.SyncPullRequests(projectID)
	if err != nil {
		return fmt.Errorf("sync pull requests failed: %w", err)
	}

	return writeSyncOutput(out, projectID, resp, quiet)
}

// syncResult holds the fields returned by the server-side sync endpoint.
type syncResult struct {
	Synced  int `json:"synced"`
	Created int `json:"created"`
	Updated int `json:"updated"`
	Closed  int `json:"closed"`
}

// writeSyncOutput writes the sync summary to out. In quiet mode only the
// project ID is written; in verbose mode a human-readable PR sync summary
// is written.
func writeSyncOutput(out io.Writer, projectID string, body []byte, quiet bool) error {
	if quiet {
		fmt.Fprintln(out, projectID)
		return nil
	}

	var result syncResult
	if err := json.Unmarshal(body, &result); err == nil && result.Synced > 0 {
		fmt.Fprintf(out, "Pull requests synced for project %s: %d synced (%d created, %d updated, %d closed)\n",
			projectID, result.Synced, result.Created, result.Updated, result.Closed)
		return nil
	}

	// Fallback for unexpected response shapes.
	fmt.Fprintf(out, "Pull request sync complete for project %s\n", projectID)
	return nil
}

// syncCmd is the cobra command for `devtrack sync`.
var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync pull requests for the current project",
	Long:  "Reads project.yaml from the current directory and triggers a server-side pull-request sync.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		manifestPath, err := internal.FindManifest()
		if err != nil {
			return err
		}

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		api := &apiSyncClient{c: c}

		quiet, _ := cmd.Flags().GetBool("quiet")

		return runSync(manifestPath, api, quiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(syncCmd)
	syncCmd.Flags().Bool("quiet", false, "Output only the project ID")
}
