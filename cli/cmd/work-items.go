package cmd

import "github.com/spf13/cobra"

var workItemsCmd = &cobra.Command{
	Use: "work-items",
	Short: "work-items",
}

func init() {
	rootCmd.AddCommand(workItemsCmd)
}
