package cmd

// swagger-jack:custom:start status
// This file implements the `devtrack status` command, which reads a project.yaml
// from the current directory and displays the project's current status including
// active PRDs, open pull requests, and recent events.
// swagger-jack:custom:end

import (
	"fmt"
	"io"
	"os"

	"devtrack/internal"
	"devtrack/internal/client"
	"devtrack/internal/response"

	"github.com/spf13/cobra"
)

// StatusProjectSummary is a lightweight representation of a project returned
// by the status API.
type StatusProjectSummary struct {
	ID   string
	Name string
}

// StatusPRD represents a PRD returned by the API for status display.
type StatusPRD struct {
	ID     string
	Title  string
	Status string
}

// StatusPR represents a pull request for status display.
type StatusPR struct {
	ID     string
	Title  string
	Status string
}

// StatusEvent represents an event for status display.
type StatusEvent struct {
	ID        string
	EventType string
	Message   string
	CreatedAt string
}

// StatusAPI is the interface runStatus accepts so callers can provide any
// API client without coupling to a concrete implementation.
type StatusAPI interface {
	ListProjects() ([]StatusProjectSummary, error)
	ListProjectPRDs(projectID string) ([]StatusPRD, error)
	ListProjectPullRequests(projectID string) ([]StatusPR, error)
	ListProjectEvents(projectID string, limit int) ([]StatusEvent, error)
}

// apiStatusClient adapts the HTTP client to satisfy StatusAPI.
type apiStatusClient struct {
	c *client.Client
}

func (a *apiStatusClient) ListProjects() ([]StatusProjectSummary, error) {
	resp, err := a.c.Do("GET", "/projects", map[string]string{}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, err
	}
	var projects []StatusProjectSummary
	if err := response.UnmarshalPaginated(resp, &projects); err != nil {
		return nil, fmt.Errorf("parse projects list: %w", err)
	}
	return projects, nil
}

func (a *apiStatusClient) ListProjectPRDs(projectID string) ([]StatusPRD, error) {
	resp, err := a.c.Do("GET", "/projects/{id}/prds", map[string]string{"id": projectID}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, err
	}
	var prds []StatusPRD
	if err := response.UnmarshalPaginated(resp, &prds); err != nil {
		return nil, fmt.Errorf("parse PRDs: %w", err)
	}
	return prds, nil
}

func (a *apiStatusClient) ListProjectPullRequests(projectID string) ([]StatusPR, error) {
	resp, err := a.c.Do("GET", "/projects/{id}/pull-requests", map[string]string{"id": projectID}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, err
	}
	var prs []StatusPR
	if err := response.UnmarshalPaginated(resp, &prs); err != nil {
		return nil, fmt.Errorf("parse pull requests: %w", err)
	}
	return prs, nil
}

func (a *apiStatusClient) ListProjectEvents(projectID string, limit int) ([]StatusEvent, error) {
	resp, err := a.c.Do("GET", "/projects/{id}/events", map[string]string{"id": projectID}, map[string]string{"per_page": fmt.Sprintf("%d", limit)}, nil)
	if err != nil {
		return nil, err
	}
	var events []StatusEvent
	if err := response.UnmarshalPaginated(resp, &events); err != nil {
		return nil, fmt.Errorf("parse events: %w", err)
	}
	return events, nil
}

// runStatus is the testable core of the status command. It reads the manifest
// at manifestPath, resolves the project ID, fetches status data via the API,
// and writes a status report to out. When quiet is true, only machine-readable
// counts are written without decorative formatting.
func runStatus(manifestPath string, api StatusAPI, quiet bool, out io.Writer) error {
	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return err
	}

	projectID, err := resolveStatusProjectID(api, manifest.Name)
	if err != nil {
		return err
	}

	prds, err := api.ListProjectPRDs(projectID)
	if err != nil {
		return fmt.Errorf("list project PRDs: %w", err)
	}

	prs, err := api.ListProjectPullRequests(projectID)
	if err != nil {
		return fmt.Errorf("list project pull requests: %w", err)
	}

	events, err := api.ListProjectEvents(projectID, recentEventsLimit)
	if err != nil {
		return fmt.Errorf("list project events: %w", err)
	}

	activePRDs := countActivePRDs(prds)
	openPRs := countOpenPRs(prs)

	if quiet {
		writeStatusQuiet(out, activePRDs, openPRs, events)
	} else {
		writeStatusVerbose(out, manifest.Name, activePRDs, openPRs, events)
	}

	return nil
}

// recentEventsLimit is the number of recent events to fetch for the status display.
const recentEventsLimit = 5

// resolveStatusProjectID finds the project ID matching the given name via the API.
func resolveStatusProjectID(api StatusAPI, projectName string) (string, error) {
	projects, err := api.ListProjects()
	if err != nil {
		return "", fmt.Errorf("list projects from API: %w", err)
	}

	for _, p := range projects {
		if p.Name == projectName {
			return p.ID, nil
		}
	}

	return "", fmt.Errorf("no project found matching name %q", projectName)
}

// countActivePRDs returns the number of PRDs with status "active".
func countActivePRDs(prds []StatusPRD) int {
	count := 0
	for _, prd := range prds {
		if prd.Status == "active" {
			count++
		}
	}
	return count
}

// countOpenPRs returns the number of pull requests with status "open".
func countOpenPRs(prs []StatusPR) int {
	count := 0
	for _, pr := range prs {
		if pr.Status == "open" {
			count++
		}
	}
	return count
}

// writeStatusVerbose writes a human-readable status report to out.
func writeStatusVerbose(out io.Writer, projectName string, activePRDs, openPRs int, events []StatusEvent) {
	fmt.Fprintf(out, "Project: %s\n\n", projectName)

	if activePRDs == 0 {
		fmt.Fprintf(out, "Active PRDs: 0 (no active PRDs)\n")
	} else {
		fmt.Fprintf(out, "Active PRDs: %d\n", activePRDs)
	}

	fmt.Fprintf(out, "Open PRs: %d\n\n", openPRs)

	if len(events) == 0 {
		fmt.Fprintf(out, "Recent Events: none\n")
		return
	}

	fmt.Fprintf(out, "Recent Events:\n")
	for _, evt := range events {
		fmt.Fprintf(out, "  [%s] %s - %s\n", evt.CreatedAt, evt.EventType, evt.Message)
	}
}

// writeStatusQuiet writes machine-readable counts to out without decorative formatting.
func writeStatusQuiet(out io.Writer, activePRDs, openPRs int, events []StatusEvent) {
	fmt.Fprintf(out, "prds=%d prs=%d events=%d\n", activePRDs, openPRs, len(events))
}

// statusCmd is the cobra command for `devtrack status`.
var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the current status of the project",
	Long:  "Reads project.yaml from the current directory and displays active PRDs, open pull requests, and recent events.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		manifestPath, err := internal.FindManifest()
		if err != nil {
			return err
		}

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		api := &apiStatusClient{c: c}

		quiet, _ := cmd.Flags().GetBool("quiet")

		return runStatus(manifestPath, api, quiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
	statusCmd.Flags().Bool("quiet", false, "Output machine-readable counts only")
}
