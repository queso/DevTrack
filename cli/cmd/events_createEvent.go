package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
	"devtrack/internal/validate"
)

var (
	eventsCreateEventCmdBody string
	eventsCreateEventCmdBodyFile string
	eventsCreateEventCmd_pullRequestId string
	eventsCreateEventCmd_title string
	eventsCreateEventCmd_type string
	eventsCreateEventCmd_metadata string
	eventsCreateEventCmd_occurredAt string
	eventsCreateEventCmd_prdId string
	eventsCreateEventCmd_projectId string
)

var eventsCreateEventCmd = &cobra.Command{
	Use: "createEvent",
	Short: "Record an event",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		if err := validate.Enum("type", eventsCreateEventCmd_type, []string{"pr_opened", "pr_merged", "pr_closed", "pr_review_requested", "pr_changes_requested", "pr_approved", "pr_reviewed", "branch_created", "branch_deleted", "prd_created", "prd_updated", "prd_completed", "prd_synced", "work_item_created", "work_item_completed", "content_published", "content_updated", "commit", "push", "session_start", "session_end"}); err != nil { return err }
		if eventsCreateEventCmdBodyFile != "" {
			fileData, err := os.ReadFile(eventsCreateEventCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			eventsCreateEventCmdBody = string(fileData)
		}
		if eventsCreateEventCmdBody != "" {
			if !json.Valid([]byte(eventsCreateEventCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(eventsCreateEventCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/events", pathParams, queryParams, bodyObj)
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
		bodyMap := map[string]interface{}{}
		bodyMap["pull_request_id"] = eventsCreateEventCmd_pullRequestId
		bodyMap["title"] = eventsCreateEventCmd_title
		bodyMap["type"] = eventsCreateEventCmd_type
		bodyMap["metadata"] = eventsCreateEventCmd_metadata
		bodyMap["occurred_at"] = eventsCreateEventCmd_occurredAt
		bodyMap["prd_id"] = eventsCreateEventCmd_prdId
		bodyMap["project_id"] = eventsCreateEventCmd_projectId
		resp, err := c.Do("POST", "/events", pathParams, queryParams, bodyMap)
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
	eventsCmd.AddCommand(eventsCreateEventCmd)
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_pullRequestId, "pull_request_id", "", "")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_title, "title", "", "")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_type, "type", "", "(pr_opened|pr_merged|pr_closed|pr_review_requested|pr_changes_requested|pr_approved|pr_reviewed|branch_created|branch_deleted|prd_created|prd_updated|prd_completed|prd_synced|work_item_created|work_item_completed|content_published|content_updated|commit|push|session_start|session_end)")
	eventsCreateEventCmd.RegisterFlagCompletionFunc("type", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"pr_opened", "pr_merged", "pr_closed", "pr_review_requested", "pr_changes_requested", "pr_approved", "pr_reviewed", "branch_created", "branch_deleted", "prd_created", "prd_updated", "prd_completed", "prd_synced", "work_item_created", "work_item_completed", "content_published", "content_updated", "commit", "push", "session_start", "session_end"}, cobra.ShellCompDirectiveNoFileComp
	})
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_metadata, "metadata", "", "")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_occurredAt, "occurred_at", "", "")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_prdId, "prd_id", "", "")
	eventsCreateEventCmd.Flags().StringVar(&eventsCreateEventCmd_projectId, "project_id", "", "")
	eventsCreateEventCmd.MarkFlagRequired("title")
	eventsCreateEventCmd.MarkFlagRequired("type")
	eventsCreateEventCmd.MarkFlagRequired("occurred_at")
	eventsCreateEventCmd.MarkFlagRequired("project_id")
}
