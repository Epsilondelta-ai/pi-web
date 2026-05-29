package piweb

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

func sessionSourcesModTime(paths ...string) time.Time {
	var latest time.Time
	for _, root := range paths {
		_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
			if err != nil || entry == nil {
				return nil
			}
			if entry.IsDir() {
				return nil
			}
			if !isSessionSourceFile(entry.Name()) {
				return nil
			}
			info, err := entry.Info()
			if err == nil && info.ModTime().After(latest) {
				latest = info.ModTime()
			}
			return nil
		})
	}
	return latest
}

func isSessionSourceFile(name string) bool {
	return strings.HasSuffix(name, ".jsonl") || name == "config.json"
}
