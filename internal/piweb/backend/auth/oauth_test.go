package auth

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPiAIOAuthIndexPathUsesExplicitEnv(t *testing.T) {
	tempDir := t.TempDir()
	oauthIndex := filepath.Join(tempDir, "oauth", "index.js")
	if err := os.MkdirAll(filepath.Dir(oauthIndex), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oauthIndex, []byte("export {};"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PI_AI_OAUTH_INDEX", oauthIndex)

	got, err := piAIOAuthIndexPath()
	if err != nil {
		t.Fatal(err)
	}
	if got != oauthIndex {
		t.Fatalf("piAIOAuthIndexPath() = %q, want %q", got, oauthIndex)
	}
}

func TestPiAIOAuthIndexCandidatesIncludeHomebrew(t *testing.T) {
	candidates := piAIOAuthIndexCandidates()
	want := "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/utils/oauth/index.js"
	for _, candidate := range candidates {
		if candidate == want {
			return
		}
	}
	t.Fatalf("piAIOAuthIndexCandidates() missing %q from %v", want, candidates)
}

func TestUniqueStringsDropsEmptyAndDuplicates(t *testing.T) {
	got := uniqueStrings([]string{"", "a", "b", "a", ""})
	want := []string{"a", "b"}
	if len(got) != len(want) {
		t.Fatalf("uniqueStrings length = %d, want %d: %v", len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("uniqueStrings()[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}
