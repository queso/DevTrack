package cmd

import (
	"fmt"
	"os"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
)

var (
	eventsSummaryGetEventSummaryCmd_date string
)

var eventsSummaryGetEventSummaryCmd = &cobra.Command{
	Use: "getEventSummary",
	Short: "Get daily event summary grouped by project",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		queryParams["date"] = eventsSummaryGetEventSummaryCmd_date
		resp, err := c.Do("GET", "/events/summary", pathParams, queryParams, nil)
		if err != nil {
			return err
		}
		jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")
		noColor, _ := cmd.Root().PersistentFlags().GetBool("no-color")
		if jsonMode {
			fmt.Printf("%s\n", string(resp))
		} else {
			if err := output.PrintTable(resp, noColor); err != nil {
				fmt.Println(string(resp))
			}
		}
		return nil
	},
}

func init() {
	eventsSummaryCmd.AddCommand(eventsSummaryGetEventSummaryCmd)
	eventsSummaryGetEventSummaryCmd.Flags().StringVar(&eventsSummaryGetEventSummaryCmd_date, "date", "", "Target date (defaults to today)")
}
