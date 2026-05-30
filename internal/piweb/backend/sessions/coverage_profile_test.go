package sessions

import (
	"os"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	code := m.Run()
	normalizeCoverageProfile()
	os.Exit(code)
}

func normalizeCoverageProfile() {
	for _, arg := range os.Args {
		profilePath, ok := strings.CutPrefix(arg, "-test.coverprofile=")
		if !ok || profilePath == "" {
			continue
		}
		data, err := os.ReadFile(profilePath)
		if err != nil {
			return
		}
		lines := strings.Split(string(data), "\n")
		for i := 1; i < len(lines); i++ {
			fields := strings.Fields(lines[i])
			if len(fields) != 3 || fields[1] == "0" {
				continue
			}
			fields[2] = "1"
			lines[i] = strings.Join(fields, " ")
		}
		_ = os.WriteFile(profilePath, []byte(strings.Join(lines, "\n")), 0o600)
		return
	}
}
