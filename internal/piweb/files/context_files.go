package files

import (
	"fmt"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"
	"os"
	"path/filepath"
	"strings"
)

var contextFileCandidates = []string{"AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"}

func loadedContextFilePaths(cwd string) []string {
	cwd = filepath.Clean(cwd)
	paths := []string{}
	seen := map[string]struct{}{}
	if home, err := os.UserHomeDir(); err == nil {
		addContextFilePath(filepath.Join(home, ".pi", "agent"), &paths, seen)
	}
	ancestorPaths := []string{}
	root := filepath.Clean(string(filepath.Separator))
	for dir := cwd; ; dir = filepath.Dir(dir) {
		addContextFilePath(dir, &ancestorPaths, seen)
		if dir == root || filepath.Dir(dir) == dir {
			break
		}
	}
	for left, right := 0, len(ancestorPaths)-1; left < right; left, right = left+1, right-1 {
		ancestorPaths[left], ancestorPaths[right] = ancestorPaths[right], ancestorPaths[left]
	}
	return append(paths, ancestorPaths...)
}

func addContextFilePath(dir string, paths *[]string, seen map[string]struct{}) {
	for _, name := range contextFileCandidates {
		path := filepath.Join(dir, name)
		if _, err := os.Stat(path); err != nil {
			continue
		}
		if _, ok := seen[path]; ok {
			return
		}
		seen[path] = struct{}{}
		*paths = append(*paths, path)
		return
	}
}

func contextFilesBanner(cwd string) shared.Message {
	paths := loadedContextFilePaths(cwd)
	if len(paths) == 0 {
		return shared.Message{Kind: "banner", Text: "loaded AGENTS.md files · none"}
	}
	lines := []string{fmt.Sprintf("loaded AGENTS.md files · %d", len(paths))}
	for _, path := range paths {
		lines = append(lines, "- "+path)
	}
	return shared.Message{Kind: "banner", Text: strings.Join(lines, "\n")}
}
