package piweb

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"time"
)

type Config struct {
	Host              string
	Port              string
	AllowedOrigins    []string
	EnablePiExecution bool
	StaticFiles       fs.FS
}

type Server struct {
	store  *Store
	broker *Broker
	runner *Runner
	mux    *http.ServeMux
	config Config
}

func NewServer(config Config, store *Store, broker *Broker) *Server {
	if config.Host == "" {
		config.Host = "127.0.0.1"
	}
	if config.Port == "" {
		config.Port = "8732"
	}
	if len(config.AllowedOrigins) == 0 {
		config.AllowedOrigins = []string{"http://localhost:4321", "http://127.0.0.1:4321", "http://localhost:6006", "http://127.0.0.1:6006"}
	}
	s := &Server{store: store, broker: broker, runner: NewRunner(), mux: http.NewServeMux(), config: config}
	s.routes()
	return s
}

func (s *Server) Addr() string {
	return s.config.Host + ":" + s.config.Port
}
func (s *Server) Handler() http.Handler {
	return s.withLogging(s.withCORS(s.mux))
}
func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /api/system/folders", s.listFolders)
	s.mux.HandleFunc("GET /api/workspaces", s.workspaces)
	s.mux.HandleFunc("POST /api/workspaces/open", s.openWorkspace)
	s.mux.HandleFunc("POST /api/workspaces/clone", s.cloneWorkspace)
	s.mux.HandleFunc("DELETE /api/workspaces/{workspaceID}", s.deleteWorkspace)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/sessions", s.workspaceSessions)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/sessions", s.createSession)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files", s.workspaceFiles)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/commands", s.workspaceCommands)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/runtime-status", s.workspaceRuntimeStatus)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/runtime-model", s.workspaceRuntimeModel)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/runtime-quota", s.workspaceRuntimeQuota)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files/read", s.readWorkspaceFile)
	s.mux.HandleFunc("PUT /api/workspaces/{workspaceID}/files/write", s.writeWorkspaceFile)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/git/status", s.gitStatus)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/shell", s.shellCommand)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}", s.session)
	s.mux.HandleFunc("PATCH /api/sessions/{sessionID}", s.renameSession)
	s.mux.HandleFunc("DELETE /api/sessions/{sessionID}", s.deleteSession)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/prompt", s.prompt)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/cancel", s.cancelSession)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}/events", s.sessionEvents)
	if s.config.StaticFiles != nil {
		s.mux.HandleFunc("GET /", s.staticFile)
	}
}
func (s *Server) context() context.Context {
	return context.Background()
}
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start).String())
	})
}
func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, ErrorResponse{Error: err.Error()})
}
func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}
