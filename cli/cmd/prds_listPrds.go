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
	prdsListPrdsCmdAll bool
	prdsListPrdsCmd_page int
	prdsListPrdsCmd_perPage int
)

var prdsListPrdsCmd = &cobra.Command{
	Use: "listPrds",
	Short: "List all PRDs",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		queryParams["page"] = strconv.Itoa(prdsListPrdsCmd_page)
		queryParams["per_page"] = strconv.Itoa(prdsListPrdsCmd_perPage)
		if prdsListPrdsCmdAll {
			_cfg := client.PaginationConfig{
				Type: client.PaginationType("page"),
				PageParam: "page",
				SizeParam: "per_page",
				CursorParam: "",
			}
			_out, _err := client.FetchAll(c, "GET", "/prds", pathParams, queryParams, _cfg)
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
		resp, err := c.Do("GET", "/prds", pathParams, queryParams, nil)
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
	prdsCmd.AddCommand(prdsListPrdsCmd)
	prdsListPrdsCmd.Flags().BoolVar(&prdsListPrdsCmdAll, "all", false, "Auto-paginate through all pages")
	prdsListPrdsCmd.Flags().IntVar(&prdsListPrdsCmd_page, "page", 0, "")
	prdsListPrdsCmd.Flags().IntVar(&prdsListPrdsCmd_perPage, "per_page", 0, "")
}
