package piweb

import (
	"bytes"
	"compress/gzip"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
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
		serveStaticFile(w, r, s.config.StaticFiles, name)
		return
	}
	if staticFallbackToIndex(name) && fsFileExists(s.config.StaticFiles, "index.html") {
		serveStaticFile(w, r, s.config.StaticFiles, "index.html")
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

func serveStaticFile(w http.ResponseWriter, r *http.Request, files fs.FS, name string) {
	if shouldGzipStaticFile(r, name) {
		if data, err := fs.ReadFile(files, name); err == nil {
			var body bytes.Buffer
			gzipWriter := gzip.NewWriter(&body)
			_, _ = gzipWriter.Write(data)
			_ = gzipWriter.Close()
			w.Header().Set("Content-Type", staticContentType(name))
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Set("Vary", "Accept-Encoding")
			http.ServeContent(w, r, name, fsModTime(files, name), bytes.NewReader(body.Bytes()))
			return
		}
	}
	http.ServeFileFS(w, r, files, name)
}

func staticContentType(name string) string {
	switch path.Ext(name) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".json":
		return "application/json; charset=utf-8"
	case ".txt":
		return "text/plain; charset=utf-8"
	default:
		return "application/octet-stream"
	}
}

func shouldGzipStaticFile(r *http.Request, name string) bool {
	if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		return false
	}
	switch path.Ext(name) {
	case ".html", ".js", ".css", ".svg", ".json", ".txt":
		return true
	default:
		return false
	}
}

func fsModTime(files fs.FS, name string) (modTime time.Time) {
	info, err := fs.Stat(files, name)
	if err == nil {
		return info.ModTime()
	}
	return modTime
}
