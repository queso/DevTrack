package cmd

import "github.com/spf13/cobra"

var webhooksGithubCmd = &cobra.Command{
	Use: "webhooks-github",
	Short: "webhooks-github",
}

func init() {
	rootCmd.AddCommand(webhooksGithubCmd)
}
