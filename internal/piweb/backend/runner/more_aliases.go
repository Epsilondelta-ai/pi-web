package runner

import (
	"encoding/json"

	backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"
	backendstore "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/store"
)

var ErrNotFound = backendstore.ErrNotFound

func convertAgentMessages(raw json.RawMessage) []Message {
	return backendsessions.ConvertAgentMessages(raw)
}
