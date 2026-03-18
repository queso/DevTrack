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
	projectsCreatePrdCmdBody string
	projectsCreatePrdCmdBodyFile string
	projectsCreatePrdCmd_projectId string
	projectsCreatePrdCmd_sourcePath string
	projectsCreatePrdCmd_status string
	projectsCreatePrdCmd_summary string
	projectsCreatePrdCmd_title string
)

var projectsCreatePrdCmd = &cobra.Command{
	Use: "createPrd <id>",
	Short: "Create a PRD",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if cmd.Flags().Changed("status") { if err := validate.Enum("status", projectsCreatePrdCmd_status, []string{"queued", "in_progress", "completed"}); err != nil { return err } }
		if projectsCreatePrdCmdBodyFile != "" {
			fileData, err := os.ReadFile(projectsCreatePrdCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			projectsCreatePrdCmdBody = string(fileData)
		}
		if projectsCreatePrdCmdBody != "" {
			if !json.Valid([]byte(projectsCreatePrdCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(projectsCreatePrdCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/projects/{id}/prds", pathParams, queryParams, bodyObj)
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
		bodyMap["project_id"] = projectsCreatePrdCmd_projectId
		bodyMap["source_path"] = projectsCreatePrdCmd_sourcePath
		bodyMap["status"] = projectsCreatePrdCmd_status
		bodyMap["summary"] = projectsCreatePrdCmd_summary
		bodyMap["title"] = projectsCreatePrdCmd_title
		resp, err := c.Do("POST", "/projects/{id}/prds", pathParams, queryParams, bodyMap)
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
	projectsCmd.AddCommand(projectsCreatePrdCmd)
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmd_projectId, "project_id", "", "")
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmd_sourcePath, "source_path", "", "")
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmd_status, "status", "", "(queued|in_progress|completed)")
	projectsCreatePrdCmd.RegisterFlagCompletionFunc("status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"queued", "in_progress", "completed"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmd_summary, "summary", "", "")
	projectsCreatePrdCmd.Flags().StringVar(&projectsCreatePrdCmd_title, "title", "", "")
	projectsCreatePrdCmd.MarkFlagRequired("project_id")
	projectsCreatePrdCmd.MarkFlagRequired("title")
}
