package piweb

import "github.com/Epsilondelta-ai/pi-web/internal/piweb/shared"

func RedactSecrets(text string) string { return shared.RedactSecrets(text) }

func RedactPayload(payload any) any { return shared.RedactPayload(payload) }
