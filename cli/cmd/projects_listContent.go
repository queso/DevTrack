package cmd

import (
	"fmt"
	"os"
	"strconv"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
	"devtrack/internal/validate"
)

var (
	projectsListContentCmdAll bool
	projectsListContentCmd_status string
	projectsListContentCmd_page int
	projectsListContentCmd_perPage int
)

var projectsListContentCmd = &cobra.Command{
	Use: "listContent <id>",
	Short: "List content items for a project",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		queryParams["status"] = projectsListContentCmd_status
		queryParams["page"] = strconv.Itoa(projectsListContentCmd_page)
		queryParams["per_page"] = strconv.Itoa(projectsListContentCmd_perPage)
		if cmd.Flags().Changed("status") { if err := validate.Enum("status", projectsListContentCmd_status, []string{"idea", "draft", "published"}); err != nil { return err } }
		if projectsListContentCmdAll {
			_cfg := client.PaginationConfig{
				Type: client.PaginationType("page"),
				PageParam: "page",
				SizeParam: "per_page",
				CursorParam: "",
			}
			_out, _err := client.FetchAll(c, "GET", "/projects/{id}/content", pathParams, queryParams, _cfg)
			if _err != nil { return _err }
			jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")
			noColor, _ := cmd.Root().PersistentFlags().GetBool("no-color")
			if jsonMode {
				fmt.Printf("%s\n", string(_out))
			} else {
				if err := output.PrintTable(_out, noColor); err != nil {
					fmt.Println(string(_out))
				}
			}
			return nil
		}
		resp, err := c.Do("GET", "/projects/{id}/content", pathParams, queryParams, nil)
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
	projectsCmd.AddCommand(projectsListContentCmd)
	projectsListContentCmd.Flags().BoolVar(&projectsListContentCmdAll, "all", false, "Auto-paginate through all pages")
	projectsListContentCmd.Flags().StringVar(&projectsListContentCmd_status, "status", "", "(idea|draft|published)")
	projectsListContentCmd.RegisterFlagCompletionFunc("status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"idea", "draft", "published"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsListContentCmd.Flags().IntVar(&projectsListContentCmd_page, "page", 0, "")
	projectsListContentCmd.Flags().IntVar(&projectsListContentCmd_perPage, "per_page", 0, "")
}
