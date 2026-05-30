package runner

import (
	"encoding/json"
	"strconv"
	"strings"

	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/store"
	"github.com/Epsilondelta-ai/pi-web/internal/piweb/eventbus"
)

func NewBroker() *eventbus.Broker                { return eventbus.NewBroker() }
func NewMockStore() *store.Store                 { return store.NewMockStore() }
func userMessages(raw json.RawMessage) []Message { return backendsessions.UserMessages(raw) }

func mergePromptAttachments(text string, attachments []PromptAttachment) string {
	if len(attachments) == 0 {
		return text
	}
	var b strings.Builder
	b.WriteString(text)
	for i, attachment := range attachments {
		if attachment.Type == "image" || strings.TrimSpace(attachment.Content) == "" {
			continue
		}
		b.WriteString("\n\n<attachment index=\"")
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString("\">\n")
		if strings.TrimSpace(attachment.Name) == "" {
			b.WriteString(attachment.Content)
		} else {
			b.WriteString("File: " + attachment.Name + "\n\n" + attachment.Content)
		}
		b.WriteString("\n</attachment>")
	}
	return b.String()
}
