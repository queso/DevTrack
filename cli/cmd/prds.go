package cmd

import "github.com/spf13/cobra"

var prdsCmd = &cobra.Command{
	Use: "prds",
	Short: "prds",
}

func init() {
	rootCmd.AddCommand(prdsCmd)
}
