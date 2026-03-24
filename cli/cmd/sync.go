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
	"path/filepath"
	"strings"

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

// FullSyncAPI extends SyncAPI with project update and PRD sync capabilities.
// runSync performs a full re-sync when the provided api satisfies this interface.
type FullSyncAPI interface {
	SyncAPI
	UpdateProject(id string, body map[string]interface{}) ([]byte, error)
	SyncPRDs(projectID string, prds []map[string]interface{}) (int, error)
}

// apiSyncClient adapts the HTTP client to satisfy FullSyncAPI.
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

func (a *apiSyncClient) UpdateProject(id string, body map[string]interface{}) ([]byte, error) {
	resp, err := a.c.Do("PATCH", "/projects/{id}", map[string]string{"id": id}, map[string]string{}, body)
	if err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return resp, nil
}

func (a *apiSyncClient) SyncPRDs(projectID string, prds []map[string]interface{}) (int, error) {
	body := map[string]interface{}{"prds": prds}
	resp, err := a.c.Do("POST", "/projects/{id}/sync-prds", map[string]string{"id": projectID}, map[string]string{}, body)
	if err != nil {
		return 0, fmt.Errorf("sync PRDs: %w", err)
	}
	var result struct {
		Synced int `json:"synced"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return 0, nil
	}
	return result.Synced, nil
}

// runSync is the testable core of the sync command. It reads the manifest at
// manifestPath, resolves the project ID via the API, triggers a server-side
// pull-request sync, and writes a result summary to out. When quiet is true,
// only a single summary line is written.
//
// If api satisfies FullSyncAPI, runSync also updates the project from the
// manifest and syncs PRDs from the prd_path directory.
func runSync(manifestPath string, api SyncAPI, quiet bool, out io.Writer) error {
	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return err
	}

	projectID, err := internal.ResolveProjectID(api, manifest)
	if err != nil {
		return fmt.Errorf("project %q not found — run `devtrack register` first: %w", manifest.Name, err)
	}

	prdCount := 0

	if fullAPI, ok := api.(FullSyncAPI); ok {
		// Step 1: update project from manifest.
		if _, updateErr := fullAPI.UpdateProject(projectID, manifestToBody(manifest)); updateErr != nil {
			return fmt.Errorf("update project: %w", updateErr)
		}

		// Step 2: sync PRDs from prd_path when configured.
		if manifest.PrdPath != "" {
			prdDir := filepath.Join(filepath.Dir(manifestPath), manifest.PrdPath)
			if prds, scanErr := scanPRDDirectory(prdDir); scanErr == nil && len(prds) > 0 {
				prdCount, _ = fullAPI.SyncPRDs(projectID, prds)
			}
		}
	}

	// Step 3: sync pull requests.
	resp, err := api.SyncPullRequests(projectID)
	if err != nil {
		return fmt.Errorf("sync pull requests failed: %w", err)
	}

	return writeSyncOutput(out, projectID, resp, prdCount, quiet)
}

// scanPRDDirectory reads all *.md files in dir and returns a slice of PRD
// body maps suitable for passing to SyncPRDs.
func scanPRDDirectory(dir string) ([]map[string]interface{}, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var prds []map[string]interface{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		content, readErr := os.ReadFile(filepath.Join(dir, e.Name()))
		if readErr != nil {
			continue
		}
		prds = append(prds, parsePRDMarkdown(e.Name(), string(content)))
	}
	return prds, nil
}

// parsePRDMarkdown extracts a title from the first H1 heading in content,
// falling back to the filename (without extension) when no heading is found.
func parsePRDMarkdown(filename, content string) map[string]interface{} {
	title := strings.TrimSuffix(filename, ".md")
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			title = strings.TrimPrefix(line, "# ")
			break
		}
	}
	return map[string]interface{}{
		"title":       title,
		"source_path": filename,
	}
}

// syncResult holds the fields returned by the server-side sync endpoint.
type syncResult struct {
	Synced  int `json:"synced"`
	Created int `json:"created"`
	Updated int `json:"updated"`
	Closed  int `json:"closed"`
}

// writeSyncOutput writes the sync summary to out. In quiet mode a single
// summary line is written; in verbose mode a human-readable multi-line
// summary is written.
func writeSyncOutput(out io.Writer, projectID string, body []byte, prdCount int, quiet bool) error {
	var result syncResult
	json.Unmarshal(body, &result) //nolint:errcheck — fallback to zero values

	if quiet {
		fmt.Fprintf(out, "Synced: %d PRDs, %d PRs\n", prdCount, result.Synced)
		return nil
	}

	fmt.Fprintf(out, "Project %s synced\n", projectID)
	fmt.Fprintf(out, "Synced: %d PRDs, %d PRs (%d created, %d updated, %d closed)\n",
		prdCount, result.Synced, result.Created, result.Updated, result.Closed)
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
