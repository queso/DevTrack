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
	projectsUpdateProjectCmdBody string
	projectsUpdateProjectCmdBodyFile string
)

var projectsUpdateProjectCmd = &cobra.Command{
	Use: "updateProject <id>",
	Short: "Update a project",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if projectsUpdateProjectCmdBodyFile != "" {
			fileData, err := os.ReadFile(projectsUpdateProjectCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			projectsUpdateProjectCmdBody = string(fileData)
		}
		if projectsUpdateProjectCmdBody != "" {
			if !json.Valid([]byte(projectsUpdateProjectCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(projectsUpdateProjectCmdBody), &bodyObj)
			resp, err := c.Do("PATCH", "/projects/{id}", pathParams, queryParams, bodyObj)
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
		resp, err := c.Do("PATCH", "/projects/{id}", pathParams, queryParams, nil)
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
	projectsCmd.AddCommand(projectsUpdateProjectCmd)
	projectsUpdateProjectCmd.Flags().StringVar(&projectsUpdateProjectCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	projectsUpdateProjectCmd.Flags().StringVar(&projectsUpdateProjectCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
}
