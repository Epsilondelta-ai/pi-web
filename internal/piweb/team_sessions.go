package piweb

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type teamConfigFile struct {
	TeamID  string             `json:"teamId"`
	Members []teamConfigMember `json:"members"`
}

type teamConfigMember struct {
	Role        string `json:"role"`
	SessionFile string `json:"sessionFile"`
}

func DefaultPiTeamsDir() string {
	if value := os.Getenv("PI_TEAMS_ROOT_DIR"); value != "" {
		if filepath.IsAbs(value) {
			return value
		}
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, ".pi", "agent", value)
		}
		return value
	}
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".pi", "agent", "teams")
	}
	return ""
}

func withTeamChildSessions(sessions []ParsedSession) []ParsedSession {
	parentIDs := map[string]struct{}{}
	for _, session := range sessions {
		parentIDs[session.Header.ID] = struct{}{}
	}
	teamSessions := LoadTeamChildSessions(parentIDs)
	if len(teamSessions) == 0 {
		return sessions
	}
	return append(sessions, teamSessions...)
}

func LoadTeamChildSessions(parentIDs map[string]struct{}) []ParsedSession {
	teamsDir := DefaultPiTeamsDir()
	entries, err := os.ReadDir(teamsDir)
	if err != nil {
		return nil
	}
	var sessions []ParsedSession
	seen := map[string]struct{}{}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") {
			continue
		}
		teamDir := filepath.Join(teamsDir, entry.Name())
		config := readTeamConfig(filepath.Join(teamDir, "config.json"))
		teamID := config.TeamID
		if teamID == "" {
			teamID = entry.Name()
		}
		if _, ok := parentIDs[teamID]; !ok {
			continue
		}
		for _, file := range teamSessionFiles(teamDir, config) {
			clean := cleanSessionPath(file)
			if _, ok := seen[clean]; ok {
				continue
			}
			seen[clean] = struct{}{}
			parsed, err := ParsePiSessionFile(file)
			if err != nil || parsed.Header.ID == "" {
				continue
			}
			parsed.Session.ParentID = teamID
			parsed.Session.Kind = SessionKindTeam
			markChildSessionLiveFromFile(&parsed)
			sessions = append(sessions, parsed)
		}
	}
	sort.Slice(sessions, func(i, j int) bool { return sessionCreatedAfter(sessions[i], sessions[j]) })
	return sessions
}

func readTeamConfig(path string) teamConfigFile {
	data, err := os.ReadFile(path)
	if err != nil {
		return teamConfigFile{}
	}
	var config teamConfigFile
	if err := json.Unmarshal(data, &config); err != nil {
		return teamConfigFile{}
	}
	return config
}

func teamSessionFiles(teamDir string, config teamConfigFile) []string {
	seen := map[string]struct{}{}
	var files []string
	add := func(path string) {
		if path == "" || filepath.Ext(path) != ".jsonl" {
			return
		}
		clean := cleanSessionPath(path)
		if _, ok := seen[clean]; ok {
			return
		}
		seen[clean] = struct{}{}
		files = append(files, path)
	}
	for _, member := range config.Members {
		if member.Role == "worker" {
			add(member.SessionFile)
		}
	}
	_ = filepath.WalkDir(filepath.Join(teamDir, "sessions"), func(path string, entry os.DirEntry, err error) error {
		if err == nil && entry.Type().IsRegular() && strings.HasSuffix(entry.Name(), ".jsonl") {
			add(path)
		}
		return nil
	})
	return files
}

func removeTeamSessionDir(sessionID string) error {
	teamsDir := DefaultPiTeamsDir()
	entries, err := os.ReadDir(teamsDir)
	if err != nil {
		return nil
	}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") {
			continue
		}
		teamDir := filepath.Join(teamsDir, entry.Name())
		config := readTeamConfig(filepath.Join(teamDir, "config.json"))
		teamID := config.TeamID
		if teamID == "" {
			teamID = entry.Name()
		}
		if teamID == sessionID {
			if err := os.RemoveAll(teamDir); err != nil {
				return err
			}
		}
	}
	return nil
}
