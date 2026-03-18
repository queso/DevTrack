package cmd

import "github.com/spf13/cobra"

var prsCmd = &cobra.Command{
	Use: "prs",
	Short: "prs",
}

func init() {
	rootCmd.AddCommand(prsCmd)
}
