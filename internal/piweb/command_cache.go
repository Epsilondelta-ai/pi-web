package piweb

import (
	"context"
	"time"
)

const commandCacheTTL = 2 * time.Minute

func (s *Server) workspaceCommandList(ctx context.Context, workspaceID, root string, reload bool) nativeCommandResult {
	if !reload {
		if result, ok := s.cachedWorkspaceCommands(workspaceID); ok {
			return result
		}
	}
	result := ListNativeSlashCommands(ctx, root)
	s.storeWorkspaceCommands(workspaceID, result)
	return result
}

func (s *Server) cachedWorkspaceCommands(workspaceID string) (nativeCommandResult, bool) {
	s.commandCache.mu.Lock()
	defer s.commandCache.mu.Unlock()
	entry, ok := s.commandCache.entries[workspaceID]
	if !ok || time.Since(entry.loaded) > commandCacheTTL {
		return nativeCommandResult{}, false
	}
	return entry.result, true
}

func (s *Server) storeWorkspaceCommands(workspaceID string, result nativeCommandResult) {
	s.commandCache.mu.Lock()
	defer s.commandCache.mu.Unlock()
	s.commandCache.entries[workspaceID] = commandCacheEntry{result: result, loaded: time.Now()}
}
