package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
)

//go:embed all:static
var staticAssets embed.FS

func main() {
	if err := newRootCommand(defaultRootDependencies()).Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func defaultRootDependencies() rootDependencies {
	return rootDependencies{
		stdout: os.Stdout,
		stderr: os.Stderr,
		serve:  runServer,
		update: runUpdate,
	}
}

func staticFiles() fs.FS {
	files, err := fs.Sub(staticAssets, "static")
	if err != nil {
		panic(err)
	}
	return files
}
