package backend

import (
	"context"
	"time"

	backendcommands "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/commands"
)

const commandCacheTTL = 2 * time.Minute

func (s *Server) workspaceCommandList(ctx context.Context, workspaceID, root string, reload bool) backendcommands.NativeCommandResult {
	if !reload {
		if result, ok := s.cachedWorkspaceCommands(workspaceID); ok {
			return result
		}
	}
	result := backendcommands.ListNativeSlashCommands(ctx, root)
	s.storeWorkspaceCommands(workspaceID, result)
	return result
}

func (s *Server) cachedWorkspaceCommands(workspaceID string) (backendcommands.NativeCommandResult, bool) {
	s.commandCache.mu.Lock()
	defer s.commandCache.mu.Unlock()
	entry, ok := s.commandCache.entries[workspaceID]
	if !ok || time.Since(entry.loaded) > commandCacheTTL {
		return backendcommands.NativeCommandResult{}, false
	}
	return entry.result, true
}

func (s *Server) storeWorkspaceCommands(workspaceID string, result backendcommands.NativeCommandResult) {
	s.commandCache.mu.Lock()
	defer s.commandCache.mu.Unlock()
	s.commandCache.entries[workspaceID] = commandCacheEntry{result: result, loaded: time.Now()}
}
