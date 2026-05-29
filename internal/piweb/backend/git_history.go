package backend

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const gitHistoryTimeout = 10 * time.Second
const maxGitCommitDiffBytes = 256 * 1024

type GitHistoryCommit struct {
	Hash        string           `json:"hash"`
	ShortHash   string           `json:"shortHash"`
	Parents     []string         `json:"parents"`
	Subject     string           `json:"subject"`
	AuthorName  string           `json:"authorName"`
	AuthorEmail string           `json:"authorEmail"`
	Date        string           `json:"date"`
	Refs        []string         `json:"refs,omitempty"`
	Files       []GitChangedFile `json:"files,omitempty"`
	Additions   int              `json:"additions"`
	Deletions   int              `json:"deletions"`
}

type GitChangedFile struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath,omitempty"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type GitCommitDetail struct {
	Commit    GitHistoryCommit `json:"commit"`
	Body      string           `json:"body"`
	Diff      string           `json:"diff"`
	Truncated bool             `json:"truncated,omitempty"`
}

func RealGitHistory(ctx context.Context, root string, limit int) ([]GitHistoryCommit, error) {
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	if err := ensureGitRepo(ctx, root); err != nil {
		return nil, err
	}
	logOutput, err := gitCommand(ctx, root, "log", "--all", "--topo-order", "--max-count="+strconv.Itoa(limit), "--date=iso-strict", "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%D%x1f%s%x1e")
	if err != nil {
		return nil, err
	}
	commits := parseGitHistoryLog(logOutput)
	for index := range commits {
		files, additions, deletions := gitCommitFiles(ctx, root, commits[index].Hash)
		commits[index].Files = files
		commits[index].Additions = additions
		commits[index].Deletions = deletions
	}
	return commits, nil
}

func RealGitCommitDetail(ctx context.Context, root, hash string) (GitCommitDetail, error) {
	hash = strings.TrimSpace(hash)
	if hash == "" || strings.ContainsAny(hash, " \t\n\r\x00") {
		return GitCommitDetail{}, errors.New("commit hash is required")
	}
	if err := ensureGitRepo(ctx, root); err != nil {
		return GitCommitDetail{}, err
	}
	logOutput, err := gitCommand(ctx, root, "show", "--no-patch", "--date=iso-strict", "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%D%x1f%s%x1e", hash)
	if err != nil {
		return GitCommitDetail{}, err
	}
	commits := parseGitHistoryLog(logOutput)
	if len(commits) == 0 {
		return GitCommitDetail{}, errors.New("commit not found")
	}
	files, additions, deletions := gitCommitFiles(ctx, root, commits[0].Hash)
	commits[0].Files = files
	commits[0].Additions = additions
	commits[0].Deletions = deletions
	body, _ := gitCommand(ctx, root, "show", "--no-patch", "--pretty=format:%B", hash)
	diff, truncated, err := runGitLimited(ctx, root, maxGitCommitDiffBytes, "show", "--format=", "--find-renames", "--patch", "--stat", hash)
	if err != nil {
		return GitCommitDetail{}, err
	}
	return GitCommitDetail{Commit: commits[0], Body: strings.TrimSpace(body), Diff: diff, Truncated: truncated}, nil
}

func ensureGitRepo(ctx context.Context, root string) error {
	_, err := gitCommand(ctx, root, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		return errors.New("workspace is not a git repository")
	}
	return nil
}

func gitCommand(ctx context.Context, root string, args ...string) (string, error) {
	out, _, err := runGitLimited(ctx, root, 0, args...)
	return out, err
}

func runGitLimited(ctx context.Context, root string, limit int, args ...string) (string, bool, error) {
	cmdCtx, cancel := context.WithTimeout(ctx, gitHistoryTimeout)
	defer cancel()
	cmd := exec.CommandContext(cmdCtx, "git", append([]string{"-C", root}, args...)...)
	var stdout, stderr limitedBuffer
	stdout.limit = limit
	stderr.limit = 64 * 1024
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if cmdCtx.Err() == context.DeadlineExceeded {
		return stdout.String(), stdout.truncated, errors.New("git command timed out")
	}
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return stdout.String(), stdout.truncated, fmt.Errorf("git command failed: %s", message)
	}
	return stdout.String(), stdout.truncated, nil
}

type limitedBuffer struct {
	bytes.Buffer
	limit     int
	truncated bool
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.limit <= 0 {
		return b.Buffer.Write(p)
	}
	remaining := b.limit - b.Buffer.Len()
	if remaining <= 0 {
		b.truncated = true
		return len(p), nil
	}
	if len(p) > remaining {
		b.truncated = true
		_, _ = b.Buffer.Write(p[:remaining])
		return len(p), nil
	}
	return b.Buffer.Write(p)
}

func parseGitHistoryLog(output string) []GitHistoryCommit {
	var commits []GitHistoryCommit
	for _, record := range strings.Split(output, "\x1e") {
		record = strings.Trim(record, "\n\r")
		if record == "" {
			continue
		}
		parts := strings.SplitN(record, "\x1f", 7)
		if len(parts) < 7 || parts[0] == "" {
			continue
		}
		parents := strings.Fields(parts[1])
		for index := range parents {
			parents[index] = shortGitHash(parents[index])
		}
		commits = append(commits, GitHistoryCommit{
			Hash:        parts[0],
			ShortHash:   shortGitHash(parts[0]),
			Parents:     parents,
			AuthorName:  parts[2],
			AuthorEmail: parts[3],
			Date:        parts[4],
			Refs:        parseGitRefs(parts[5]),
			Subject:     parts[6],
		})
	}
	return commits
}

func parseGitRefs(refs string) []string {
	refs = strings.TrimSpace(refs)
	if refs == "" {
		return nil
	}
	parts := strings.Split(refs, ",")
	out := make([]string, 0, len(parts))
	for _, ref := range parts {
		ref = strings.TrimSpace(strings.TrimPrefix(ref, "HEAD -> "))
		ref = strings.TrimSpace(strings.TrimPrefix(ref, "tag: "))
		if ref != "" {
			out = append(out, ref)
		}
	}
	return out
}

func gitCommitFiles(ctx context.Context, root, hash string) ([]GitChangedFile, int, int) {
	nameStatus, err := gitCommand(ctx, root, "show", "--format=", "--find-renames", "--name-status", hash)
	if err != nil {
		return nil, 0, 0
	}
	numstat, err := gitCommand(ctx, root, "show", "--format=", "--find-renames", "--numstat", hash)
	if err != nil {
		return nil, 0, 0
	}
	return parseGitCommitFiles(nameStatus + "\n" + numstat)
}

func parseGitCommitFiles(output string) ([]GitChangedFile, int, int) {
	statusByPath := map[string]string{}
	oldPathByPath := map[string]string{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 2 || len(fields[0]) == 0 {
			continue
		}
		status := gitNameStatusKind(fields[0])
		if status == "" {
			continue
		}
		pathIndex := 1
		if strings.HasPrefix(fields[0], "R") || strings.HasPrefix(fields[0], "C") {
			pathIndex = 2
			if len(fields) > 2 {
				oldPathByPath[filepath.ToSlash(fields[2])] = filepath.ToSlash(fields[1])
			}
		}
		if len(fields) > pathIndex {
			statusByPath[filepath.ToSlash(fields[pathIndex])] = status
		}
	}
	var files []GitChangedFile
	var additions, deletions int
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 3 || !isNumstatField(fields[0]) {
			continue
		}
		added := parseGitCount(fields[0])
		deleted := parseGitCount(fields[1])
		pathIndex := 2
		oldPath := ""
		path := filepath.ToSlash(fields[pathIndex])
		if len(fields) > 3 {
			oldPath = filepath.ToSlash(fields[2])
			path = filepath.ToSlash(fields[3])
		}
		files = append(files, GitChangedFile{Path: path, OldPath: oldPathByPath[path], Status: statusByPath[path], Additions: added, Deletions: deleted})
		if oldPath != "" && files[len(files)-1].OldPath == "" {
			files[len(files)-1].OldPath = oldPath
		}
		additions += added
		deletions += deleted
	}
	return files, additions, deletions
}

func isNumstatField(value string) bool {
	if value == "-" {
		return true
	}
	_, err := strconv.Atoi(value)
	return err == nil
}

func parseGitCount(value string) int {
	if value == "-" {
		return 0
	}
	count, _ := strconv.Atoi(value)
	return count
}

func gitNameStatusKind(code string) string {
	switch code[0] {
	case 'A':
		return "added"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case 'M':
		return "modified"
	case 'T':
		return "type-changed"
	}
	return "modified"
}

func shortGitHash(hash string) string {
	if len(hash) <= 8 {
		return hash
	}
	return hash[:8]
}
