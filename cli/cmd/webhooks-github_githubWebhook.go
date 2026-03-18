package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
)

var (
	webhooksGithubGithubWebhookCmdBody string
	webhooksGithubGithubWebhookCmdBodyFile string
)

var webhooksGithubGithubWebhookCmd = &cobra.Command{
	Use: "githubWebhook",
	Short: "Receive GitHub webhook events",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		if webhooksGithubGithubWebhookCmdBodyFile != "" {
			fileData, err := os.ReadFile(webhooksGithubGithubWebhookCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			webhooksGithubGithubWebhookCmdBody = string(fileData)
		}
		if webhooksGithubGithubWebhookCmdBody != "" {
			if !json.Valid([]byte(webhooksGithubGithubWebhookCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(webhooksGithubGithubWebhookCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/webhooks/github", pathParams, queryParams, bodyObj)
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
		}
		resp, err := c.Do("POST", "/webhooks/github", pathParams, queryParams, nil)
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
	webhooksGithubCmd.AddCommand(webhooksGithubGithubWebhookCmd)
	webhooksGithubGithubWebhookCmd.Flags().StringVar(&webhooksGithubGithubWebhookCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	webhooksGithubGithubWebhookCmd.Flags().StringVar(&webhooksGithubGithubWebhookCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
}
