package piweb

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadWorkspaceFileRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	content, err := ReadWorkspaceFile(root, "note.txt", 1024)
	if err != nil || content.Content != "hello" {
		t.Fatalf("unexpected content: %#v %v", content, err)
	}
	if _, err := ReadWorkspaceFile(root, "../secret", 1024); err == nil {
		t.Fatal("expected traversal to fail")
	}
}

func TestReadWorkspaceFilePreviewsTextLikeSourceFiles(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{
		"script.sh":       "#!/usr/bin/env bash\necho hello\n",
		"component.ts":    "export const answer: number = 42\n",
		"component.tsx":   "export function Demo() { return <div /> }\n",
		"README.md":       "# hello\n",
		"Dockerfile":      "FROM scratch\n",
		"config.yaml":     "name: demo\n",
		"unknown.configx": "plain text config\n",
	}
	for name, body := range files {
		path := filepath.Join(root, name)
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		content, err := ReadWorkspaceFile(root, name, 1024)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if content.PreviewKind != "text" || content.Content != body {
			t.Fatalf("%s: unexpected preview: %#v", name, content)
		}
	}
}

func TestReadWorkspaceFileDoesNotPreviewBinaryWithTextExtension(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "clip.txt")
	if err := os.WriteFile(path, []byte{0x00, 0x47, 0x40, 0x10, 0xff}, 0o600); err != nil {
		t.Fatal(err)
	}
	content, err := ReadWorkspaceFile(root, "clip.txt", 1024)
	if err != nil {
		t.Fatal(err)
	}
	if content.PreviewKind == "text" || content.Content != "" {
		t.Fatalf("unexpected binary preview: %#v", content)
	}
}

func TestRealFileTree(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "src"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "main.go"), []byte("package main"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "node_modules"), 0o700); err != nil {
		t.Fatal(err)
	}
	nodes, err := RealFileTree(root, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 || nodes[0].Name != "src" || len(nodes[0].Children) != 1 {
		t.Fatalf("unexpected nodes: %#v", nodes)
	}
}
