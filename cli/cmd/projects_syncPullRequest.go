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
	projectsSyncPullRequestCmdBody string
	projectsSyncPullRequestCmdBodyFile string
	projectsSyncPullRequestCmd_githubId int
	projectsSyncPullRequestCmd_number int
	projectsSyncPullRequestCmd_openedAt string
	projectsSyncPullRequestCmd_checkStatus string
	projectsSyncPullRequestCmd_mergedAt string
	projectsSyncPullRequestCmd_prdId string
	projectsSyncPullRequestCmd_projectId string
	projectsSyncPullRequestCmd_status string
	projectsSyncPullRequestCmd_title string
	projectsSyncPullRequestCmd_url string
	projectsSyncPullRequestCmd_author string
	projectsSyncPullRequestCmd_branchId string
)

var projectsSyncPullRequestCmd = &cobra.Command{
	Use: "syncPullRequest <id>",
	Short: "Sync a pull request from GitHub",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if cmd.Flags().Changed("check_status") { if err := validate.Enum("check_status", projectsSyncPullRequestCmd_checkStatus, []string{"pending", "passing", "failing"}); err != nil { return err } }
		if cmd.Flags().Changed("status") { if err := validate.Enum("status", projectsSyncPullRequestCmd_status, []string{"open", "closed", "merged", "draft", "review_requested", "changes_requested", "approved"}); err != nil { return err } }
		if projectsSyncPullRequestCmdBodyFile != "" {
			fileData, err := os.ReadFile(projectsSyncPullRequestCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			projectsSyncPullRequestCmdBody = string(fileData)
		}
		if projectsSyncPullRequestCmdBody != "" {
			if !json.Valid([]byte(projectsSyncPullRequestCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(projectsSyncPullRequestCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/projects/{id}/prs", pathParams, queryParams, bodyObj)
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
		bodyMap["github_id"] = projectsSyncPullRequestCmd_githubId
		bodyMap["number"] = projectsSyncPullRequestCmd_number
		bodyMap["opened_at"] = projectsSyncPullRequestCmd_openedAt
		bodyMap["check_status"] = projectsSyncPullRequestCmd_checkStatus
		bodyMap["merged_at"] = projectsSyncPullRequestCmd_mergedAt
		bodyMap["prd_id"] = projectsSyncPullRequestCmd_prdId
		bodyMap["project_id"] = projectsSyncPullRequestCmd_projectId
		bodyMap["status"] = projectsSyncPullRequestCmd_status
		bodyMap["title"] = projectsSyncPullRequestCmd_title
		bodyMap["url"] = projectsSyncPullRequestCmd_url
		bodyMap["author"] = projectsSyncPullRequestCmd_author
		bodyMap["branch_id"] = projectsSyncPullRequestCmd_branchId
		resp, err := c.Do("POST", "/projects/{id}/prs", pathParams, queryParams, bodyMap)
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
	projectsCmd.AddCommand(projectsSyncPullRequestCmd)
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	projectsSyncPullRequestCmd.Flags().IntVar(&projectsSyncPullRequestCmd_githubId, "github_id", 0, "")
	projectsSyncPullRequestCmd.Flags().IntVar(&projectsSyncPullRequestCmd_number, "number", 0, "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_openedAt, "opened_at", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_checkStatus, "check_status", "", "(pending|passing|failing)")
	projectsSyncPullRequestCmd.RegisterFlagCompletionFunc("check_status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"pending", "passing", "failing"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_mergedAt, "merged_at", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_prdId, "prd_id", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_projectId, "project_id", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_status, "status", "", "(open|closed|merged|draft|review_requested|changes_requested|approved)")
	projectsSyncPullRequestCmd.RegisterFlagCompletionFunc("status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"open", "closed", "merged", "draft", "review_requested", "changes_requested", "approved"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_title, "title", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_url, "url", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_author, "author", "", "")
	projectsSyncPullRequestCmd.Flags().StringVar(&projectsSyncPullRequestCmd_branchId, "branch_id", "", "")
	projectsSyncPullRequestCmd.MarkFlagRequired("github_id")
	projectsSyncPullRequestCmd.MarkFlagRequired("number")
	projectsSyncPullRequestCmd.MarkFlagRequired("opened_at")
	projectsSyncPullRequestCmd.MarkFlagRequired("project_id")
	projectsSyncPullRequestCmd.MarkFlagRequired("title")
	projectsSyncPullRequestCmd.MarkFlagRequired("url")
	projectsSyncPullRequestCmd.MarkFlagRequired("author")
}
