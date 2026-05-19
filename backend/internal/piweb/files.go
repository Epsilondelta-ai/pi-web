package piweb

import (
	"encoding/base64"
	"errors"
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
	return fileNodes(root, root, entries, 0, maxDepth), nil
}

func fileNodes(root, parent string, entries []os.DirEntry, depth, maxDepth int) []FileNode {
	var nodes []FileNode
	for _, entry := range entries {
		name := entry.Name()
		if shouldSkipFile(name) {
			continue
		}
		path := filepath.Join(parent, name)
		rel, _ := filepath.Rel(root, path)
		node := FileNode{Name: name, Path: filepath.ToSlash(rel), Depth: depth}
		if entry.IsDir() {
			node.Type = "dir"
			if depth < maxDepth {
				if children, err := os.ReadDir(path); err == nil {
					node.Children = fileNodes(root, path, children, depth+1, maxDepth)
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

func ReadWorkspaceFile(root, rel string, maxBytes int64) (FileContent, error) {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return FileContent{}, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return FileContent{}, err
	}
	if info.IsDir() {
		return FileContent{}, errors.New("path is a directory")
	}
	file, err := os.Open(full)
	if err != nil {
		return FileContent{}, err
	}
	defer file.Close()
	limit := maxBytes
	if limit <= 0 {
		limit = 256 * 1024
	}
	buf := make([]byte, limit+1)
	n, _ := file.Read(buf)
	truncated := int64(n) > limit
	if truncated {
		n = int(limit)
	}
	data := buf[:n]
	mimeType := detectPreviewMIME(full, data)
	previewKind := previewKindForMIME(mimeType)
	content := ""
	dataURL := ""
	if previewKind == "text" || mimeType == "image/svg+xml" {
		content = string(data)
	}
	if previewKind == "image" && !truncated {
		encoded := base64.StdEncoding.EncodeToString(data)
		dataURL = "data:" + mimeType + ";base64," + encoded
	}
	if previewKind == "image" && truncated {
		previewKind = "unsupported"
	}
	return FileContent{
		Path:        filepath.ToSlash(filepath.Clean(rel)),
		Content:     content,
		DataURL:     dataURL,
		MIME:        mimeType,
		PreviewKind: previewKind,
		Truncated:   truncated,
	}, nil
}

func WriteWorkspaceFile(root, rel, content string) (FileContent, error) {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return FileContent{}, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return FileContent{}, err
	}
	if info.IsDir() {
		return FileContent{}, errors.New("path is a directory")
	}
	if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
		return FileContent{}, err
	}
	return ReadWorkspaceFile(root, rel, 256*1024)
}

func SafeJoin(root, rel string) (string, error) {
	root = filepath.Clean(root)
	cleanRel := filepath.Clean(strings.TrimPrefix(rel, "/"))
	if cleanRel == "." || cleanRel == "" {
		return "", errors.New("path is required")
	}
	full := filepath.Join(root, cleanRel)
	relBack, err := filepath.Rel(root, full)
	if err != nil || strings.HasPrefix(relBack, "..") || filepath.IsAbs(relBack) {
		return "", errors.New("path traversal is not allowed")
	}
	return full, nil
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
