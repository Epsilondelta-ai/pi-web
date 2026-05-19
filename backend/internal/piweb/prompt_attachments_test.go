package piweb

import (
	"os"
	"strings"
	"testing"
)

func TestMergePromptAttachmentsLeavesImagesOutOfText(t *testing.T) {
	text := mergePromptAttachments("look", []PromptAttachment{
		{Type: "image", Name: "shot.png", MIMEType: "image/png", DataURL: "data:image/png;base64,ZmFrZQ=="},
		{Type: "file", Name: "note.txt", Content: "hello"},
	})

	if strings.Contains(text, "shot.png") || strings.Contains(text, "data:image") {
		t.Fatalf("image data should not be merged into prompt text: %q", text)
	}
	if !strings.Contains(text, "File: note.txt\n\nhello") {
		t.Fatalf("text attachment missing from prompt: %q", text)
	}
}

func TestWritePromptImagesCreatesFilesForPiFileReferences(t *testing.T) {
	paths, cleanup, err := writePromptImages([]PromptAttachment{
		{Type: "image", Name: "shot.png", MIMEType: "image/png", DataURL: "data:image/png;base64,ZmFrZQ=="},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()

	if len(paths) != 1 || !strings.HasSuffix(paths[0], "shot.png") {
		t.Fatalf("unexpected image paths: %#v", paths)
	}
	data, err := os.ReadFile(paths[0])
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "fake" {
		t.Fatalf("unexpected image data: %q", string(data))
	}
}

func TestPiPromptArgsPassImagesAsFileReferences(t *testing.T) {
	args := piPromptArgs("session.jsonl", "what is this?", []string{"/tmp/shot.png"})
	joined := strings.Join(args, "\n")
	if !strings.Contains(joined, "@/tmp/shot.png") {
		t.Fatalf("missing image file reference: %#v", args)
	}
	if args[len(args)-1] != "what is this?" {
		t.Fatalf("prompt text should be the last arg: %#v", args)
	}
}
