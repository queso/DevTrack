package cmd

import "github.com/spf13/cobra"

var eventsSummaryCmd = &cobra.Command{
	Use: "events-summary",
	Short: "events-summary",
}

func init() {
	rootCmd.AddCommand(eventsSummaryCmd)
}
