package files

import (
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

func detectPreviewMIME(path string, data []byte) string {
	likelyText := isLikelyText(data)
	if textType := textPreviewMIME(path, likelyText); textType != "" {
		return textType
	}
	if extType := extensionPreviewMIME(path, likelyText); extType != "" {
		return extType
	}
	detectedType := cleanMIME(http.DetectContentType(data))
	if likelyText && (detectedType == "application/octet-stream" || strings.HasPrefix(detectedType, "text/")) {
		return "text/plain"
	}
	return detectedType
}

func cleanMIME(mimeType string) string {
	return strings.Split(mimeType, ";")[0]
}

func textPreviewMIME(path string, likelyText bool) string {
	if !likelyText {
		return ""
	}
	name := strings.ToLower(filepath.Base(path))
	if mimeType := textPreviewMIMEByName[name]; mimeType != "" {
		return mimeType
	}
	return textPreviewMIMEByExtension[strings.ToLower(filepath.Ext(path))]
}

func extensionPreviewMIME(path string, likelyText bool) string {
	extType := cleanMIME(mime.TypeByExtension(strings.ToLower(filepath.Ext(path))))
	if extType == "" || (!likelyText && isTextPreviewMIME(extType)) {
		return ""
	}
	return extType
}

func isLikelyText(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	if !utf8.Valid(data) {
		return false
	}
	controlBytes := 0
	for _, b := range data {
		if b == 0 {
			return false
		}
		if b < 32 && b != '\t' && b != '\n' && b != '\r' && b != '\f' {
			controlBytes++
		}
	}
	return controlBytes*100/len(data) < 5
}

func previewKindForMIME(mimeType string) string {
	if mimeType == "image/svg+xml" {
		return "image"
	}
	if isTextPreviewMIME(mimeType) {
		return "text"
	}
	if strings.HasPrefix(mimeType, "image/") {
		return "image"
	}
	return "unsupported"
}

func isTextPreviewMIME(mimeType string) bool {
	return strings.HasPrefix(mimeType, "text/") || mimeType == "application/json" || strings.HasSuffix(mimeType, "+xml")
}

var textPreviewMIMEByName = map[string]string{
	".babelrc":         "application/json",
	".dockerignore":    "text/plain",
	".editorconfig":    "text/plain",
	".env":             "text/plain",
	".eslintignore":    "text/plain",
	".eslintrc":        "application/json",
	".gitattributes":   "text/plain",
	".gitignore":       "text/plain",
	".npmignore":       "text/plain",
	".npmrc":           "text/plain",
	".prettierignore":  "text/plain",
	".prettierrc":      "application/json",
	".stylelintrc":     "application/json",
	"authors":          "text/plain",
	"changelog":        "text/plain",
	"codeowners":       "text/plain",
	"contributing":     "text/plain",
	"dockerfile":       "text/x-dockerfile",
	"gemfile":          "text/x-ruby",
	"justfile":         "text/x-makefile",
	"license":          "text/plain",
	"makefile":         "text/x-makefile",
	"notice":           "text/plain",
	"procfile":         "text/plain",
	"rakefile":         "text/x-ruby",
	"readme":           "text/plain",
	"requirements.txt": "text/plain",
}

var textPreviewMIMEByExtension = map[string]string{
	".astro":      "text/x-astro",
	".bash":       "text/x-shellscript",
	".bat":        "text/x-msdos-batch",
	".c":          "text/x-c",
	".cc":         "text/x-c++",
	".cfg":        "text/plain",
	".cjs":        "text/javascript",
	".clj":        "text/x-clojure",
	".cljs":       "text/x-clojure",
	".cmake":      "text/x-cmake",
	".cmd":        "text/x-msdos-batch",
	".conf":       "text/plain",
	".cpp":        "text/x-c++",
	".cs":         "text/x-csharp",
	".csh":        "text/x-shellscript",
	".css":        "text/css",
	".csv":        "text/csv",
	".cts":        "text/typescript",
	".cxx":        "text/x-c++",
	".dart":       "text/x-dart",
	".diff":       "text/x-diff",
	".dockerfile": "text/x-dockerfile",
	".ejs":        "text/html",
	".env":        "text/plain",
	".erb":        "text/html",
	".fish":       "text/x-shellscript",
	".fs":         "text/x-fsharp",
	".fsx":        "text/x-fsharp",
	".go":         "text/x-go",
	".gradle":     "text/x-groovy",
	".graphql":    "text/graphql",
	".groovy":     "text/x-groovy",
	".h":          "text/x-c",
	".handlebars": "text/html",
	".hbs":        "text/html",
	".hpp":        "text/x-c++",
	".hs":         "text/x-haskell",
	".htm":        "text/html",
	".html":       "text/html",
	".ini":        "text/plain",
	".ipynb":      "application/json",
	".java":       "text/x-java",
	".jl":         "text/x-julia",
	".js":         "text/javascript",
	".json":       "application/json",
	".jsonc":      "application/json",
	".jsx":        "text/javascript",
	".kt":         "text/x-kotlin",
	".kts":        "text/x-kotlin",
	".less":       "text/css",
	".liquid":     "text/html",
	".lock":       "text/plain",
	".log":        "text/plain",
	".lua":        "text/x-lua",
	".m":          "text/x-objective-c",
	".md":         "text/markdown",
	".mdx":        "text/markdown",
	".mjs":        "text/javascript",
	".mm":         "text/x-objective-c++",
	".mts":        "text/typescript",
	".mustache":   "text/html",
	".nix":        "text/x-nix",
	".patch":      "text/x-diff",
	".php":        "text/x-php",
	".pl":         "text/x-perl",
	".pm":         "text/x-perl",
	".properties": "text/plain",
	".proto":      "text/plain",
	".ps1":        "text/x-powershell",
	".py":         "text/x-python",
	".r":          "text/x-r",
	".rb":         "text/x-ruby",
	".rs":         "text/x-rust",
	".rst":        "text/plain",
	".sass":       "text/css",
	".scala":      "text/x-scala",
	".scss":       "text/css",
	".sh":         "text/x-shellscript",
	".sql":        "text/x-sql",
	".svelte":     "text/x-svelte",
	".swift":      "text/x-swift",
	".tex":        "text/x-tex",
	".tf":         "text/plain",
	".tfvars":     "text/plain",
	".toml":       "text/toml",
	".ts":         "text/typescript",
	".tsx":        "text/typescript",
	".twig":       "text/html",
	".txt":        "text/plain",
	".vim":        "text/plain",
	".vue":        "text/x-vue",
	".xhtml":      "text/html",
	".xml":        "text/xml",
	".yaml":       "text/yaml",
	".yml":        "text/yaml",
	".zsh":        "text/x-shellscript",
}
