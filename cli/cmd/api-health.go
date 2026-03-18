package cmd

import "github.com/spf13/cobra"

var apiHealthCmd = &cobra.Command{
	Use: "api-health",
	Short: "api-health",
}

func init() {
	rootCmd.AddCommand(apiHealthCmd)
}
