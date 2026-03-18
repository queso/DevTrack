package cmd

import "github.com/spf13/cobra"

var contentCmd = &cobra.Command{
	Use: "content",
	Short: "content",
}

func init() {
	rootCmd.AddCommand(contentCmd)
}
