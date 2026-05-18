package piweb

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func RealFileTree(root string, maxDepth int) ([]FileNode, error) {
	root = filepath.Clean(root)
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	return fileNodes(root, entries, 0, maxDepth), nil
}

func fileNodes(parent string, entries []os.DirEntry, depth, maxDepth int) []FileNode {
	var nodes []FileNode
	for _, entry := range entries {
		name := entry.Name()
		if shouldSkipFile(name) {
			continue
		}
		node := FileNode{Name: name, Depth: depth}
		path := filepath.Join(parent, name)
		if entry.IsDir() {
			node.Type = "dir"
			node.Open = depth == 0
			if depth < maxDepth {
				if children, err := os.ReadDir(path); err == nil {
					node.Children = fileNodes(path, children, depth+1, maxDepth)
				}
			}
		} else {
			node.Type = "file"
		}
		nodes = append(nodes, node)
	}
	return nodes
}

func shouldSkipFile(name string) bool {
	if strings.HasPrefix(name, ".git") || name == "node_modules" || name == "dist" || name == "storybook-static" || name == ".astro" {
		return true
	}
	return false
}

func RealGitStatus(root string) (GitStatus, error) {
	branchBytes, err := exec.Command("git", "-C", root, "branch", "--show-current").Output()
	if err != nil {
		return GitStatus{}, err
	}
	statusBytes, err := exec.Command("git", "-C", root, "status", "--porcelain").Output()
	if err != nil {
		return GitStatus{}, err
	}
	branch := strings.TrimSpace(string(branchBytes))
	if branch == "" {
		branch = "HEAD"
	}
	dirty := 0
	for _, line := range strings.Split(strings.TrimSpace(string(statusBytes)), "\n") {
		if strings.TrimSpace(line) != "" {
			dirty++
		}
	}
	return GitStatus{Branch: branch, Dirty: dirty}, nil
}

func SessionShortID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

func uniqueID(base string, used map[string]int) string {
	if used[base] == 0 {
		used[base] = 1
		return base
	}
	used[base]++
	return base + "-" + strconv.Itoa(used[base])
}
