package cmd

import (
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

func (a *apiDashboardClient) ListDashboardProjects() ([]DashboardProject, error) {
	// Real implementation would call the API and aggregate data.
	// For now this is a placeholder that returns an empty list.
	return []DashboardProject{}, nil
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
