package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"devtrack/internal"
	"devtrack/internal/client"

	"github.com/spf13/cobra"
)

// DashboardProject is the per-project data the dashboard command fetches.
// It combines the core project summary with dashboard-specific fields.
type DashboardProject struct {
	Project      internal.ProjectSummary
	ActivePRD    string    // name/title of the active PRD, empty if none
	LastActivity time.Time // UTC timestamp of the last event recorded
}

// DashboardAPI is the contract between runDashboard and the DevTrack API.
type DashboardAPI interface {
	// ListDashboardProjects returns every project together with its active
	// PRD title and the timestamp of the most recent event.
	ListDashboardProjects() ([]DashboardProject, error)
}

// activityAge classifies how recently a project was active.
type activityAge int

const (
	activityToday activityAge = iota
	activityThisWeek
	activityStale
)

// staleDaysThreshold is the number of days after which a project is stale.
const staleDaysThreshold = 7

// classifyActivity returns the age category for a given last-activity timestamp.
func classifyActivity(lastActivity time.Time) activityAge {
	hoursSince := time.Since(lastActivity).Hours()
	daysSince := hoursSince / 24

	switch {
	case hoursSince < 24:
		return activityToday
	case daysSince < float64(staleDaysThreshold):
		return activityThisWeek
	default:
		return activityStale
	}
}

// activityLabel returns the text label for a given activity age.
func activityLabel(age activityAge) string {
	switch age {
	case activityToday:
		return "today"
	case activityThisWeek:
		return "this week"
	default:
		return "stale"
	}
}

// activitySymbol returns a visual marker for a given activity age.
func activitySymbol(age activityAge) string {
	switch age {
	case activityToday:
		return "●"
	case activityThisWeek:
		return "◐"
	default:
		return "○"
	}
}

// runDashboard fetches all projects and renders the dashboard to out.
// When quiet is true, only project names are printed with no decorations.
func runDashboard(api DashboardAPI, quiet bool, out io.Writer) error {
	projects, err := api.ListDashboardProjects()
	if err != nil {
		return fmt.Errorf("fetch dashboard projects: %w", err)
	}

	if len(projects) == 0 {
		fmt.Fprintln(out, "No projects found.")
		return nil
	}

	if quiet {
		return renderQuiet(projects, out)
	}
	return renderFull(projects, out)
}

// renderQuiet prints only project names, one per line.
func renderQuiet(projects []DashboardProject, out io.Writer) error {
	for _, p := range projects {
		fmt.Fprintln(out, p.Project.Name)
	}
	return nil
}

// renderFull prints a formatted table with activity labels, PRD info, and a legend.
func renderFull(projects []DashboardProject, out io.Writer) error {
	fmt.Fprintln(out, "Dashboard")
	fmt.Fprintln(out, "---------")

	for _, p := range projects {
		age := classifyActivity(p.LastActivity)
		symbol := activitySymbol(age)
		label := activityLabel(age)

		line := fmt.Sprintf("  %s  %-30s  [%s]", symbol, p.Project.Name, label)
		if p.ActivePRD != "" {
			line += fmt.Sprintf("  PRD: %s", p.ActivePRD)
		}
		fmt.Fprintln(out, line)
	}

	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "Legend: ● today  ◐ this week  ○ stale")
	return nil
}

// apiDashboardClient adapts the HTTP client to satisfy DashboardAPI.
type apiDashboardClient struct {
	c *client.Client
}

// dashboardProjectRecord is the minimal shape of a project returned by
// GET /projects.
type dashboardProjectRecord struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// dashboardStatusRecord mirrors what GET /projects/{id}/status returns inside
// the data envelope.
type dashboardStatusRecord struct {
	ActivePRDCount int        `json:"active_prd_count"`
	LastActivityAt *time.Time `json:"last_activity_at"`
}

// dashboardPRDRecord is the minimal PRD record returned by
// GET /projects/{id}/prds.
type dashboardPRDRecord struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// dashboardUnmarshalWrapped tries to decode JSON in paginated {"data": [...]}
// form first, then falls back to a direct top-level value.
func dashboardUnmarshalWrapped(data []byte, target interface{}) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err == nil {
		if dataRaw, ok := raw["data"]; ok {
			return json.Unmarshal(dataRaw, target)
		}
	}
	return json.Unmarshal(data, target)
}

// ListDashboardProjects calls the DevTrack API to build the full dashboard
// project list. For each project it:
//  1. Fetches GET /projects to get all project IDs and names.
//  2. Fetches GET /projects/{id}/status per project to get last_activity_at
//     and the count of active PRDs.
//  3. When active_prd_count > 0, fetches GET /projects/{id}/prds?per_page=1
//     to retrieve the title of the most recent active PRD.
func (a *apiDashboardClient) ListDashboardProjects() ([]DashboardProject, error) {
	// Step 1: list all projects.
	resp, err := a.c.Do("GET", "/projects", map[string]string{}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}

	var projects []dashboardProjectRecord
	if err := dashboardUnmarshalWrapped(resp, &projects); err != nil {
		return nil, fmt.Errorf("parse projects list: %w", err)
	}

	result := make([]DashboardProject, 0, len(projects))

	for _, p := range projects {
		// Step 2: fetch status for this project.
		statusResp, err := a.c.Do("GET", "/projects/{id}/status", map[string]string{"id": p.ID}, map[string]string{}, nil)
		if err != nil {
			return nil, fmt.Errorf("get status for project %q: %w", p.ID, err)
		}

		var status dashboardStatusRecord
		if err := dashboardUnmarshalWrapped(statusResp, &status); err != nil {
			return nil, fmt.Errorf("parse status for project %q: %w", p.ID, err)
		}

		dp := DashboardProject{
			Project: internal.ProjectSummary{
				ID:   p.ID,
				Name: p.Name,
			},
		}

		// Map last_activity_at — zero time when the API returns null.
		if status.LastActivityAt != nil {
			dp.LastActivity = *status.LastActivityAt
		}

		// Step 3: when there are active PRDs, retrieve the title of the first one.
		if status.ActivePRDCount > 0 {
			prdsResp, err := a.c.Do("GET", "/projects/{id}/prds", map[string]string{"id": p.ID}, map[string]string{"per_page": "1"}, nil)
			if err != nil {
				return nil, fmt.Errorf("get PRDs for project %q: %w", p.ID, err)
			}

			var prds []dashboardPRDRecord
			if err := dashboardUnmarshalWrapped(prdsResp, &prds); err != nil {
				return nil, fmt.Errorf("parse PRDs for project %q: %w", p.ID, err)
			}

			if len(prds) > 0 {
				dp.ActivePRD = prds[0].Title
			}
		}

		result = append(result, dp)
	}

	return result, nil
}

// dashboardCmd is the cobra command for `devtrack dashboard`.
var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Show project dashboard",
	Long:  "Displays all tracked projects with their activity status and active PRD.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		api := &apiDashboardClient{c: c}

		quiet, _ := cmd.Flags().GetBool("quiet")

		return runDashboard(api, quiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(dashboardCmd)
	dashboardCmd.Flags().Bool("quiet", false, "Output only project names")
}
