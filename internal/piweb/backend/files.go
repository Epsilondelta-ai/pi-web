package backend

import (
	"encoding/base64"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const maxSearchFileBytes = 256 * 1024

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
	if name == ".git" || name == "node_modules" || name == "dist" || name == "storybook-static" || name == ".astro" {
		return true
	}
	return false
}

func SearchWorkspaceFiles(root, query string) ([]string, error) {
	root = filepath.Clean(root)
	needle := strings.ToLower(strings.TrimSpace(query))
	if needle == "" {
		return []string{}, nil
	}
	var matches []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := entry.Name()
		if shouldSkipFile(name) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if strings.Contains(strings.ToLower(rel), needle) || fileContentContains(path, needle) {
			matches = append(matches, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return matches, nil
}

func fileContentContains(path, needle string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()
	buf := make([]byte, maxSearchFileBytes+1)
	n, _ := file.Read(buf)
	if n > maxSearchFileBytes {
		n = maxSearchFileBytes
	}
	data := buf[:n]
	mimeType := detectPreviewMIME(path, data)
	if previewKindForMIME(mimeType) != "text" && mimeType != "image/svg+xml" {
		return false
	}
	return strings.Contains(strings.ToLower(string(data)), needle)
}

func ReadWorkspaceFile(root, rel string, maxBytes int64) (FileContent, error) {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return FileContent{}, err
	}
	cleanRel := filepath.ToSlash(filepath.Clean(strings.TrimPrefix(rel, "/")))
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
	originalContent, gitStatus := GitOriginalFileContent(root, cleanRel)
	return FileContent{
		Path:            cleanRel,
		Content:         content,
		OriginalContent: originalContent,
		GitStatus:       gitStatus,
		DataURL:         dataURL,
		MIME:            mimeType,
		PreviewKind:     previewKind,
		Truncated:       truncated,
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

func CreateWorkspacePath(root, rel, kind, content string) (FileContent, error) {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return FileContent{}, err
	}
	if _, err := os.Stat(full); err == nil {
		return FileContent{}, errors.New("path already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return FileContent{}, err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o700); err != nil {
		return FileContent{}, err
	}
	if kind == "dir" {
		if err := os.Mkdir(full, 0o700); err != nil {
			return FileContent{}, err
		}
		return FileContent{Path: filepath.ToSlash(filepath.Clean(rel)), PreviewKind: "unsupported"}, nil
	}
	if kind != "file" {
		return FileContent{}, errors.New("kind must be file or dir")
	}
	if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
		return FileContent{}, err
	}
	return ReadWorkspaceFile(root, rel, 256*1024)
}

func RenameWorkspacePath(root, oldRel, newRel string) error {
	oldFull, err := SafeJoin(root, oldRel)
	if err != nil {
		return err
	}
	newFull, err := SafeJoin(root, newRel)
	if err != nil {
		return err
	}
	if _, err := os.Stat(oldFull); err != nil {
		return err
	}
	if _, err := os.Stat(newFull); err == nil {
		return errors.New("target already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(newFull), 0o700); err != nil {
		return err
	}
	return os.Rename(oldFull, newFull)
}

func DeleteWorkspacePath(root, rel string) error {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return err
	}
	if _, err := os.Stat(full); err != nil {
		return err
	}
	return os.RemoveAll(full)
}

func UploadWorkspaceFile(root, rel string, data []byte, overwrite bool) (FileContent, error) {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return FileContent{}, err
	}
	if info, err := os.Stat(full); err == nil {
		if info.IsDir() {
			return FileContent{}, errors.New("path is a directory")
		}
		if !overwrite {
			return FileContent{}, errors.New("path already exists")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return FileContent{}, err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o700); err != nil {
		return FileContent{}, err
	}
	if err := os.WriteFile(full, data, 0o600); err != nil {
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

func GitOriginalFileContent(root, rel string) (string, string) {
	cleanRel := filepath.ToSlash(filepath.Clean(strings.TrimPrefix(rel, "/")))
	if cleanRel == "." || cleanRel == "" {
		return "", ""
	}
	trackedPathBytes, err := exec.Command("git", "-C", root, "ls-files", "--full-name", "--", cleanRel).Output()
	if err != nil {
		return "", ""
	}
	trackedPath := strings.TrimSpace(string(trackedPathBytes))
	if trackedPath == "" {
		if _, err := exec.Command("git", "-C", root, "rev-parse", "--show-toplevel").Output(); err == nil {
			return "", "untracked"
		}
		return "", ""
	}
	blob, err := exec.Command("git", "-C", root, "show", "HEAD:"+trackedPath).Output()
	if err != nil {
		return "", "added"
	}
	return string(blob), "tracked"
}

func RealGitStatus(root string) (GitStatus, error) {
	branchBytes, err := exec.Command("git", "-C", root, "branch", "--show-current").Output()
	if err != nil {
		return GitStatus{}, err
	}
	statusBytes, err := exec.Command("git", "-C", root, "status", "--porcelain=v1", "-z").Output()
	if err != nil {
		return GitStatus{}, err
	}
	branch := strings.TrimSpace(string(branchBytes))
	if branch == "" {
		branch = "HEAD"
	}
	files := ParseGitStatusPorcelain(statusBytes)
	return GitStatus{Branch: branch, Dirty: len(files), Files: files}, nil
}

func ParseGitStatusPorcelain(output []byte) map[string]string {
	files := map[string]string{}
	fields := strings.Split(string(output), "\x00")
	for index := 0; index < len(fields); index++ {
		entry := fields[index]
		if len(entry) < 4 {
			continue
		}
		code := entry[:2]
		path := filepath.ToSlash(strings.TrimSpace(entry[3:]))
		if path == "" {
			continue
		}
		status := gitStatusKind(code)
		files[path] = status
		if code[0] == 'R' || code[1] == 'R' || code[0] == 'C' || code[1] == 'C' {
			if index+1 < len(fields) && fields[index+1] != "" {
				oldPath := filepath.ToSlash(strings.TrimSpace(fields[index+1]))
				if oldPath != "" {
					files[oldPath] = "deleted"
				}
				index++
			}
		}
	}
	return files
}

func gitStatusKind(code string) string {
	if code == "??" {
		return "untracked"
	}
	if strings.ContainsAny(code, "R") || strings.ContainsAny(code, "C") {
		return "renamed"
	}
	if strings.ContainsAny(code, "D") {
		return "deleted"
	}
	if strings.ContainsAny(code, "A") {
		return "added"
	}
	if strings.ContainsAny(code, "MUT") {
		return "modified"
	}
	return "modified"
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
