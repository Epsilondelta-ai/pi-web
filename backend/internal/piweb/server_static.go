package piweb

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

func (s *Server) staticFile(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "." || name == "" {
		name = "index.html"
	}
	if fsFileExists(s.config.StaticFiles, name) {
		http.ServeFileFS(w, r, s.config.StaticFiles, name)
		return
	}
	if staticFallbackToIndex(name) && fsFileExists(s.config.StaticFiles, "index.html") {
		http.ServeFileFS(w, r, s.config.StaticFiles, "index.html")
		return
	}
	http.NotFound(w, r)
}
func fsFileExists(files fs.FS, name string) bool {
	info, err := fs.Stat(files, name)
	return err == nil && !info.IsDir()
}
func staticFallbackToIndex(name string) bool {
	return !strings.HasPrefix(name, "assets/") && !strings.Contains(path.Base(name), ".")
}
