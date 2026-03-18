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
	projectsCreateContentCmdBody string
	projectsCreateContentCmdBodyFile string
	projectsCreateContentCmd_title string
	projectsCreateContentCmd_projectId string
	projectsCreateContentCmd_publishedAt string
	projectsCreateContentCmd_sourcePath string
	projectsCreateContentCmd_status string
	projectsCreateContentCmd_summary string
	projectsCreateContentCmd_tags []string
)

var projectsCreateContentCmd = &cobra.Command{
	Use: "createContent <id>",
	Short: "Create a content item",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if cmd.Flags().Changed("status") { if err := validate.Enum("status", projectsCreateContentCmd_status, []string{"idea", "draft", "published"}); err != nil { return err } }
		if projectsCreateContentCmdBodyFile != "" {
			fileData, err := os.ReadFile(projectsCreateContentCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			projectsCreateContentCmdBody = string(fileData)
		}
		if projectsCreateContentCmdBody != "" {
			if !json.Valid([]byte(projectsCreateContentCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(projectsCreateContentCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/projects/{id}/content", pathParams, queryParams, bodyObj)
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
		bodyMap["title"] = projectsCreateContentCmd_title
		bodyMap["project_id"] = projectsCreateContentCmd_projectId
		bodyMap["published_at"] = projectsCreateContentCmd_publishedAt
		bodyMap["source_path"] = projectsCreateContentCmd_sourcePath
		bodyMap["status"] = projectsCreateContentCmd_status
		bodyMap["summary"] = projectsCreateContentCmd_summary
		bodyMap["tags"] = projectsCreateContentCmd_tags
		resp, err := c.Do("POST", "/projects/{id}/content", pathParams, queryParams, bodyMap)
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
	projectsCmd.AddCommand(projectsCreateContentCmd)
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmd_title, "title", "", "")
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmd_projectId, "project_id", "", "")
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmd_publishedAt, "published_at", "", "")
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmd_sourcePath, "source_path", "", "")
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmd_status, "status", "", "(idea|draft|published)")
	projectsCreateContentCmd.RegisterFlagCompletionFunc("status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"idea", "draft", "published"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsCreateContentCmd.Flags().StringVar(&projectsCreateContentCmd_summary, "summary", "", "")
	projectsCreateContentCmd.Flags().StringArrayVar(&projectsCreateContentCmd_tags, "tags", nil, "")
	projectsCreateContentCmd.MarkFlagRequired("title")
	projectsCreateContentCmd.MarkFlagRequired("project_id")
}
