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
	prdsCreateWorkItemCmdBody string
	prdsCreateWorkItemCmdBodyFile string
	prdsCreateWorkItemCmd_status string
	prdsCreateWorkItemCmd_title string
	prdsCreateWorkItemCmd_order int
	prdsCreateWorkItemCmd_prdId string
)

var prdsCreateWorkItemCmd = &cobra.Command{
	Use: "createWorkItem <id>",
	Short: "Create a work item",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if cmd.Flags().Changed("status") { if err := validate.Enum("status", prdsCreateWorkItemCmd_status, []string{"todo", "in_progress", "done"}); err != nil { return err } }
		if prdsCreateWorkItemCmdBodyFile != "" {
			fileData, err := os.ReadFile(prdsCreateWorkItemCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			prdsCreateWorkItemCmdBody = string(fileData)
		}
		if prdsCreateWorkItemCmdBody != "" {
			if !json.Valid([]byte(prdsCreateWorkItemCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(prdsCreateWorkItemCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/prds/{id}/work-items", pathParams, queryParams, bodyObj)
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
		bodyMap["status"] = prdsCreateWorkItemCmd_status
		bodyMap["title"] = prdsCreateWorkItemCmd_title
		bodyMap["order"] = prdsCreateWorkItemCmd_order
		bodyMap["prd_id"] = prdsCreateWorkItemCmd_prdId
		resp, err := c.Do("POST", "/prds/{id}/work-items", pathParams, queryParams, bodyMap)
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
	prdsCmd.AddCommand(prdsCreateWorkItemCmd)
	prdsCreateWorkItemCmd.Flags().StringVar(&prdsCreateWorkItemCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	prdsCreateWorkItemCmd.Flags().StringVar(&prdsCreateWorkItemCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	prdsCreateWorkItemCmd.Flags().StringVar(&prdsCreateWorkItemCmd_status, "status", "", "(todo|in_progress|done)")
	prdsCreateWorkItemCmd.RegisterFlagCompletionFunc("status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"todo", "in_progress", "done"}, cobra.ShellCompDirectiveNoFileComp
	})
	prdsCreateWorkItemCmd.Flags().StringVar(&prdsCreateWorkItemCmd_title, "title", "", "")
	prdsCreateWorkItemCmd.Flags().IntVar(&prdsCreateWorkItemCmd_order, "order", 0, "")
	prdsCreateWorkItemCmd.Flags().StringVar(&prdsCreateWorkItemCmd_prdId, "prd_id", "", "")
	prdsCreateWorkItemCmd.MarkFlagRequired("title")
	prdsCreateWorkItemCmd.MarkFlagRequired("order")
	prdsCreateWorkItemCmd.MarkFlagRequired("prd_id")
}
