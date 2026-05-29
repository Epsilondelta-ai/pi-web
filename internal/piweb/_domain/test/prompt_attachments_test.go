package piweb

import (
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

func TestRPCImagesStripDataURLPrefix(t *testing.T) {
	images := rpcImages([]PromptAttachment{
		{Type: "image", Name: "shot.png", MIMEType: "image/png", DataURL: "data:image/png;base64,ZmFrZQ=="},
	})

	if len(images) != 1 {
		t.Fatalf("unexpected images: %#v", images)
	}
	if images[0].Data != "ZmFrZQ==" || images[0].MIMEType != "image/png" {
		t.Fatalf("unexpected rpc image: %#v", images[0])
	}
}

func TestHandlePiJSONEventSkipsUserEcho(t *testing.T) {
	broker := NewBroker()
	store := NewMockStore()
	state := &jsonStreamState{}

	handlePiJSONEvent(
		`{"type":"message_end","message":{"role":"user","content":"<file name=\"/tmp/image.png\">[Image: original]</file>\n잘 보이나? 이미지?"}}`,
		broker,
		store,
		"8e7c-44ff",
		state,
	)

	if replay := broker.Replay("8e7c-44ff", 0); len(replay) != 0 {
		t.Fatalf("user echo should not be replayed: %#v", replay)
	}
}

func TestUserMessagesExtractImageAttachments(t *testing.T) {
	messages := userMessages([]byte(`[
		{"type":"image","data":"ZmFrZQ==","mimeType":"image/png"},
		{"type":"text","text":"잘 보이나? 이미지?"}
	]`))

	if len(messages) != 1 || messages[0].Text != "잘 보이나? 이미지?" {
		t.Fatalf("unexpected messages: %#v", messages)
	}
	if len(messages[0].Attachments) != 1 || !strings.Contains(messages[0].Attachments[0].DataURL, "ZmFrZQ==") {
		t.Fatalf("image attachment missing: %#v", messages[0].Attachments)
	}
}

func TestPiRPCArgsUseRPCMode(t *testing.T) {
	args := piRPCArgs("session.jsonl")
	joined := strings.Join(args, "\n")
	if !strings.Contains(joined, "--mode\nrpc") {
		t.Fatalf("missing rpc mode: %#v", args)
	}
	if !strings.Contains(joined, "--session\nsession.jsonl") {
		t.Fatalf("missing session file: %#v", args)
	}
}
