package backend

import (
	"crypto/sha1"
	"encoding/hex"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type Store struct {
	mu                       sync.RWMutex
	workspaces               []Workspace
	files                    map[string][]FileNode
	conversations            map[string][]Message
	workspacePath            map[string]string
	sessionFiles             map[string]string
	sessionCWD               map[string]string
	workspaceSessionDir      map[string]string
	sessionDirModTime        map[string]time.Time
	dbPath                   string
	refreshDisabledWorkspace map[string]bool
}

func NewAutoStore() *Store {
	return NewWebStore(DefaultWebDBPath())
}
func NewWebStore(dbPath string) *Store {
	store := emptyStore(dbPath)
	for _, path := range LoadWebWorkspacePaths(dbPath) {
		clean, err := ValidateWorkspacePath(path)
		if err == nil {
			store.addWorkspaceLocked(clean)
		}
	}
	return store
}
func emptyStore(dbPath string) *Store {
	return &Store{
		workspaces:               []Workspace{},
		files:                    map[string][]FileNode{},
		conversations:            map[string][]Message{},
		workspacePath:            map[string]string{},
		sessionFiles:             map[string]string{},
		sessionCWD:               map[string]string{},
		workspaceSessionDir:      map[string]string{},
		sessionDirModTime:        map[string]time.Time{},
		refreshDisabledWorkspace: map[string]bool{},
		dbPath:                   dbPath,
	}
}
func NewPiStore(sessionDir string) (*Store, error) {
	parsed, err := LoadPiSessions(sessionDir)
	if err != nil {
		return nil, err
	}
	parsed = withTeamChildSessions(parsed)
	parentCWD := parentSessionCWD(parsed)
	workspaceIDs := workspaceIDsForSessions(parsed, parentCWD)
	byWorkspace := map[string]*Workspace{}
	workspacePath := map[string]string{}
	sessionFiles := map[string]string{}
	sessionCWD := map[string]string{}
	workspaceSessionDir := map[string]string{}
	conversations := map[string][]Message{}
	workspaceLastUsed := map[string]time.Time{}
	for _, item := range parsed {
		workspaceRoot := workspaceRootForSession(item, parentCWD)
		id := workspaceIDs[workspaceRoot]
		workspace, ok := byWorkspace[id]
		if !ok {
			workspace = &Workspace{ID: id, Name: filepath.Base(workspaceRoot), Path: workspaceRoot, LastUsed: item.Session.LastUsed}
			byWorkspace[id] = workspace
			workspacePath[id] = workspaceRoot
			workspaceSessionDir[id] = parsedWorkspaceSessionDir(sessionDir, item.File)
		}
		if lastUsedAt, ok := workspaceLastUsed[id]; !ok || item.ModTime.After(lastUsedAt) {
			workspaceLastUsed[id] = item.ModTime
			workspace.LastUsed = item.Session.LastUsed
		}
		item.Session.Workspace = id
		item.Session.ID = item.Header.ID
		workspace.Sessions = append(workspace.Sessions, item.Session)
		workspace.SessionCount = len(workspace.Sessions)
		sessionFiles[item.Header.ID] = item.File
		sessionCWD[item.Header.ID] = item.Header.CWD
		conversations[item.Header.ID] = item.Messages
	}
	var workspaces []Workspace
	for _, workspace := range byWorkspace {
		workspaces = append(workspaces, *workspace)
	}
	sort.Slice(workspaces, func(i, j int) bool { return workspaces[i].Path < workspaces[j].Path })
	return &Store{
		workspaces:               workspaces,
		files:                    map[string][]FileNode{},
		conversations:            conversations,
		workspacePath:            workspacePath,
		sessionFiles:             sessionFiles,
		sessionCWD:               sessionCWD,
		workspaceSessionDir:      workspaceSessionDir,
		sessionDirModTime:        map[string]time.Time{},
		refreshDisabledWorkspace: map[string]bool{},
	}, nil
}
func parentSessionCWD(sessions []ParsedSession) map[string]string {
	parents := map[string]string{}
	for _, item := range sessions {
		if item.Session.ParentID == "" && item.Header.ID != "" && item.Header.CWD != "" {
			parents[item.Header.ID] = item.Header.CWD
		}
	}
	return parents
}

func workspaceRootForSession(item ParsedSession, parentCWD map[string]string) string {
	if item.Session.ParentID != "" {
		if cwd := parentCWD[item.Session.ParentID]; cwd != "" {
			return cwd
		}
	}
	return item.Header.CWD
}

func workspaceIDsForSessions(sessions []ParsedSession, parentCWD map[string]string) map[string]string {
	baseRoots := map[string]map[string]struct{}{}
	for _, item := range sessions {
		root := workspaceRootForSession(item, parentCWD)
		base := workspaceIDFromPath(root)
		if baseRoots[base] == nil {
			baseRoots[base] = map[string]struct{}{}
		}
		baseRoots[base][root] = struct{}{}
	}
	ids := map[string]string{}
	for _, item := range sessions {
		root := workspaceRootForSession(item, parentCWD)
		if ids[root] != "" {
			continue
		}
		base := workspaceIDFromPath(root)
		if len(baseRoots[base]) > 1 {
			ids[root] = base + "-" + shortPathHash(root)
		} else {
			ids[root] = base
		}
	}
	return ids
}

func shortPathHash(path string) string {
	sum := sha1.Sum([]byte(filepath.Clean(path)))
	return hex.EncodeToString(sum[:])[:8]
}

func (s *Store) saveWorkspaceRecentsLocked() {
	paths := make([]string, 0, len(s.workspaces))
	for _, workspace := range s.workspaces {
		if workspace.Path != "" {
			paths = append(paths, workspace.Path)
		}
	}
	_ = SaveWebWorkspacePaths(s.dbPath, paths)
}
func (s *Store) addWorkspaceLocked(clean string) Workspace {
	for _, workspace := range s.workspaces {
		if workspace.Path == clean {
			return workspace
		}
	}
	id := slug(filepath.Base(clean))
	if id == "" {
		id = "workspace"
	}
	used := map[string]int{}
	for _, workspace := range s.workspaces {
		used[workspace.ID] = 1
	}
	baseID := id
	for used[id] > 0 {
		id = uniqueID(baseID, used)
	}
	workspace := Workspace{ID: id, Name: filepath.Base(clean), Path: clean, LastUsed: "now", Sessions: []Session{}}
	parsed, err := LoadPiSessionSummaries(piSessionDirForCWD(clean))
	if err == nil {
		parsed = withTeamChildSessions(parsed)
		var latestSessionModTime time.Time
		for _, item := range parsed {
			item.Session.Workspace = id
			item.Session.ID = item.Header.ID
			workspace.Sessions = append(workspace.Sessions, item.Session)
			s.sessionFiles[item.Header.ID] = item.File
			s.sessionCWD[item.Header.ID] = item.Header.CWD
			if item.ModTime.After(latestSessionModTime) {
				latestSessionModTime = item.ModTime
				workspace.LastUsed = item.Session.LastUsed
			}
		}
	}
	workspace.SessionCount = len(workspace.Sessions)
	s.workspaces = append([]Workspace{workspace}, s.workspaces...)
	s.files[id] = []FileNode{}
	s.workspacePath[id] = clean
	s.workspaceSessionDir[id] = piSessionDirForCWD(clean)
	return workspace
}
