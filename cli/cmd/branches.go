package cmd

import "github.com/spf13/cobra"

var branchesCmd = &cobra.Command{
	Use: "branches",
	Short: "branches",
}

func init() {
	rootCmd.AddCommand(branchesCmd)
}
