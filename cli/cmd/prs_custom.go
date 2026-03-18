package cmd

// swagger-jack:custom:start prs-convenience
// This file implements the `devtrack prs` convenience command, which lists
// pull requests from the DevTrack API with a human-friendly table output.
// swagger-jack:custom:end

import (
	"fmt"
	"io"
	"math"
	"os"
	"time"

	"devtrack/internal/client"
	"devtrack/internal/response"

	"github.com/spf13/cobra"
)

// PRSummary represents a single pull request returned by the API.
type PRSummary struct {
	Number    int
	Title     string
	Author    string
	Status    string // "open", "closed", "merged"
	CreatedAt time.Time
}

// PRAPI is the interface runPRs accepts so callers can inject any backend
// without coupling to a concrete HTTP client.
type PRAPI interface {
	ListPullRequests(status string) ([]PRSummary, error)
}

// apiPRClient adapts the HTTP client to satisfy PRAPI.
type apiPRClient struct {
	c *client.Client
}

func (a *apiPRClient) ListPullRequests(status string) ([]PRSummary, error) {
	queryParams := map[string]string{}
	if status != "" {
		queryParams["status"] = status
	}

	resp, err := a.c.Do("GET", "/prs", map[string]string{}, queryParams, nil)
	if err != nil {
		return nil, fmt.Errorf("list pull requests: %w", err)
	}

	var prs []PRSummary
	if err := response.UnmarshalPaginated(resp, &prs); err != nil {
		return nil, fmt.Errorf("parse pull requests list: %w", err)
	}
	return prs, nil
}

// runPRs is the testable core of the prs convenience command. It fetches pull
// requests filtered by status and writes a formatted table to out. When quiet
// is true only PR numbers are written (one per line). An error is returned when
// the API call fails.
func runPRs(status string, quiet bool, api PRAPI, out io.Writer) error {
	prs, err := api.ListPullRequests(status)
	if err != nil {
		return fmt.Errorf("list pull requests: %w", err)
	}

	if len(prs) == 0 {
		fmt.Fprintln(out, "No PRs found.")
		return nil
	}

	if quiet {
		return writePRsQuiet(prs, out)
	}

	return writePRsTable(prs, out)
}

// writePRsQuiet writes only the PR number for each PR, one per line.
func writePRsQuiet(prs []PRSummary, out io.Writer) error {
	for _, pr := range prs {
		fmt.Fprintln(out, pr.Number)
	}
	return nil
}

// writePRsTable writes a human-readable table with columns for #, title,
// author, status, and age.
func writePRsTable(prs []PRSummary, out io.Writer) error {
	now := time.Now()

	// Column widths are determined by the widest value in each column.
	maxTitle := len("Title")
	maxAuthor := len("Author")
	maxStatus := len("Status")

	for _, pr := range prs {
		if len(pr.Title) > maxTitle {
			maxTitle = len(pr.Title)
		}
		if len(pr.Author) > maxAuthor {
			maxAuthor = len(pr.Author)
		}
		if len(pr.Status) > maxStatus {
			maxStatus = len(pr.Status)
		}
	}

	rowFormat := fmt.Sprintf("%%6s  %%-%ds  %%-%ds  %%-%ds  %%s\n",
		maxTitle, maxAuthor, maxStatus)

	fmt.Fprintf(out, rowFormat, "#", "Title", "Author", "Status", "Age")
	fmt.Fprintf(out, rowFormat, "------", padRight("", maxTitle, '-'), padRight("", maxAuthor, '-'), padRight("", maxStatus, '-'), "---")

	for _, pr := range prs {
		age := formatAge(now.Sub(pr.CreatedAt))
		fmt.Fprintf(out, rowFormat,
			fmt.Sprintf("%d", pr.Number),
			pr.Title,
			pr.Author,
			pr.Status,
			age,
		)
	}

	return nil
}

// padRight returns a string of length n filled with the given rune.
func padRight(s string, n int, fill rune) string {
	if len(s) >= n {
		return s
	}
	b := make([]rune, n)
	for i := range b {
		b[i] = fill
	}
	return string(b)
}

// formatAge converts a duration into a short human-readable age string such as
// "3h", "2d", or "5m".
func formatAge(d time.Duration) string {
	hours := d.Hours()
	if hours < 1 {
		minutes := int(math.Round(d.Minutes()))
		return fmt.Sprintf("%dm", minutes)
	}
	if hours < 24 {
		return fmt.Sprintf("%dh", int(math.Round(hours)))
	}
	days := int(math.Round(hours / 24))
	return fmt.Sprintf("%dd", days)
}

// prsConvenienceCmd is the cobra command for `devtrack prs list` convenience view.
var prsConvenienceCmd = &cobra.Command{
	Use:   "list",
	Short: "List pull requests in a human-friendly table",
	Long:  "Fetch and display pull requests from DevTrack with columns for number, title, author, status, and age.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		status, _ := cmd.Flags().GetString("status")
		quiet, _ := cmd.Flags().GetBool("quiet")

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		api := &apiPRClient{c: c}

		return runPRs(status, quiet, api, cmd.OutOrStdout())
	},
}

func init() {
	prsCmd.AddCommand(prsConvenienceCmd)
	prsConvenienceCmd.Flags().String("status", "open", "Filter by status (open|closed|merged)")
	prsConvenienceCmd.Flags().Bool("quiet", false, "Output only PR numbers")
}
