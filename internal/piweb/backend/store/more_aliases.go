package store

import backendsessions "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/sessions"

func normalizeSessionMessageLimit(limit int) int { return backendsessions.NormalizeMessageLimit(limit) }
func trimTitle(value string) string              { return backendsessions.TrimTitle(value) }
func sessionCreatedAfter(left, right ParsedSession) bool {
	return backendsessions.SessionCreatedAfter(left, right)
}
func canAutoNameTitle(title string) bool { return backendsessions.CanAutoNameTitle(title) }
