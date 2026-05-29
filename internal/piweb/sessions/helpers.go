package sessions

import (
	"path/filepath"
	"regexp"
	"strings"
)

var nonSlug = regexp.MustCompile(`[^a-zA-Z0-9]+`)

func slug(value string) string {
	trimmed := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(value), "-"), "-")
	if trimmed == "" {
		return "workspace"
	}
	return trimmed
}

func imageExtension(mimeType string) string {
	switch mimeType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return filepath.Ext(mimeType)
	}
}
