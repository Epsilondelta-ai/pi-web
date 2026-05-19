package main

import (
	"io"

	"github.com/spf13/cobra"
)

const githubRepositorySlug = "Epsilondelta-ai/pi-web-ui"

var version = "v1.0.0"

type rootDependencies struct {
	stdout io.Writer
	stderr io.Writer
	serve  func(serverOptions) error
	update func(io.Writer, updateOptions) error
}

type serverOptions struct {
	Host string
	Port string
	Mock bool
}

type updateOptions struct {
	CurrentVersion string
	RepositorySlug string
}

func newRootCommand(deps rootDependencies) *cobra.Command {
	options := serverOptions{Host: "0.0.0.0", Port: "8732"}

	cmd := &cobra.Command{
		Use:           "pi-web",
		Short:         "Run the pi web UI",
		Version:       version,
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			return deps.serve(options)
		},
	}
	cmd.SetVersionTemplate("{{.Name}} {{.Version}}\n")
	cmd.SetOut(deps.stdout)
	cmd.SetErr(deps.stderr)
	cmd.CompletionOptions.DisableDefaultCmd = true

	cmd.Flags().StringVar(&options.Host, "host", options.Host, "host to bind")
	cmd.Flags().StringVar(&options.Port, "port", options.Port, "port to bind")
	cmd.Flags().BoolVar(&options.Mock, "mock", false, "mock prompt streaming instead of executing the local pi CLI")
	cmd.AddCommand(newUpdateCommand(deps.update))

	return cmd
}

func newUpdateCommand(update func(io.Writer, updateOptions) error) *cobra.Command {
	return &cobra.Command{
		Use:   "update",
		Short: "Update pi-web to the latest GitHub release",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return update(cmd.OutOrStdout(), updateOptions{
				CurrentVersion: version,
				RepositorySlug: githubRepositorySlug,
			})
		},
	}
}
