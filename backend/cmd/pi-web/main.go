package main

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"os"
)

//go:embed all:static
var staticAssets embed.FS

type rootCommandExecutor interface {
	Execute() error
}

var (
	newRootCommandForMain = func(deps rootDependencies) rootCommandExecutor {
		return newRootCommand(deps)
	}
	defaultRootDependenciesForMain           = defaultRootDependencies
	stderrForMain                  io.Writer = os.Stderr
	exitForMain                              = os.Exit
)

func main() {
	if err := newRootCommandForMain(defaultRootDependenciesForMain()).Execute(); err != nil {
		fmt.Fprintln(stderrForMain, err)
		exitForMain(1)
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
	return mustSub(staticAssets, "static")
}

func mustSub(fsys fs.FS, dir string) fs.FS {
	files, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return files
}
