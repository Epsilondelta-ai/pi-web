package store

func EmptyStore(dbPath string) *Store                           { return emptyStore(dbPath) }
func UniqueWorkspaceID(base string, used map[string]int) string { return uniqueWorkspaceID(base, used) }
func (s *Store) ConversationLen(sessionID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.conversations[sessionID])
}
