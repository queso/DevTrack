package cmd

import (
	"fmt"
	"os"
	"strconv"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
)

var (
	projectsListProjectPrdsCmdAll bool
	projectsListProjectPrdsCmd_page int
	projectsListProjectPrdsCmd_perPage int
)

var projectsListProjectPrdsCmd = &cobra.Command{
	Use: "listProjectPrds <id>",
	Short: "List PRDs for a project",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		queryParams["page"] = strconv.Itoa(projectsListProjectPrdsCmd_page)
		queryParams["per_page"] = strconv.Itoa(projectsListProjectPrdsCmd_perPage)
		if projectsListProjectPrdsCmdAll {
			_cfg := client.PaginationConfig{
				Type: client.PaginationType("page"),
				PageParam: "page",
				SizeParam: "per_page",
				CursorParam: "",
			}
			_out, _err := client.FetchAll(c, "GET", "/projects/{id}/prds", pathParams, queryParams, _cfg)
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
		resp, err := c.Do("GET", "/projects/{id}/prds", pathParams, queryParams, nil)
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
	projectsCmd.AddCommand(projectsListProjectPrdsCmd)
	projectsListProjectPrdsCmd.Flags().BoolVar(&projectsListProjectPrdsCmdAll, "all", false, "Auto-paginate through all pages")
	projectsListProjectPrdsCmd.Flags().IntVar(&projectsListProjectPrdsCmd_page, "page", 0, "")
	projectsListProjectPrdsCmd.Flags().IntVar(&projectsListProjectPrdsCmd_perPage, "per_page", 0, "")
}
