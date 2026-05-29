package backend

import (
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

const latestPiVersionURL = "https://pi.dev/api/latest-version"

type latestPiVersionResponse struct {
	Version     string `json:"version"`
	PackageName string `json:"packageName"`
	Note        string `json:"note"`
}

func MockPiVersionStatus() PiVersionStatus {
	return PiVersionStatus{CurrentVersion: "0.0.0"}
}

func DetectPiVersionStatus(ctx context.Context) (PiVersionStatus, error) {
	current, err := CurrentPiVersion(ctx)
	status := PiVersionStatus{CurrentVersion: current}
	if err != nil {
		status.Error = err.Error()
		return status, nil
	}
	latest, err := LatestPiVersion(ctx, current)
	if err != nil {
		status.Error = err.Error()
		return status, nil
	}
	status.LatestVersion = latest.Version
	status.PackageName = latest.PackageName
	status.Note = latest.Note
	status.UpdateAvailable = latest.Version != "" && isNewerVersion(latest.Version, current)
	return status, nil
}

func CurrentPiVersion(ctx context.Context) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "pi", "--version")
	configureCommandProcessGroup(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func LatestPiVersion(ctx context.Context, current string) (latestPiVersionResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, latestPiVersionURL, nil)
	if err != nil {
		return latestPiVersionResponse{}, err
	}
	req.Header.Set("User-Agent", "pi-web pi/"+current)
	req.Header.Set("Accept", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return latestPiVersionResponse{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return latestPiVersionResponse{}, nil
	}
	var latest latestPiVersionResponse
	if err := json.NewDecoder(res.Body).Decode(&latest); err != nil {
		return latestPiVersionResponse{}, err
	}
	latest.Version = strings.TrimSpace(latest.Version)
	latest.PackageName = strings.TrimSpace(latest.PackageName)
	latest.Note = strings.TrimSpace(latest.Note)
	return latest, nil
}

func isNewerVersion(candidate string, current string) bool {
	candidate = strings.TrimPrefix(strings.TrimSpace(candidate), "v")
	current = strings.TrimPrefix(strings.TrimSpace(current), "v")
	candidateParts := strings.Split(candidate, ".")
	currentParts := strings.Split(current, ".")
	if len(candidateParts) < 3 || len(currentParts) < 3 {
		return candidate != "" && candidate != current
	}
	for i := 0; i < 3; i++ {
		candidateNumber := leadingVersionNumber(candidateParts[i])
		currentNumber := leadingVersionNumber(currentParts[i])
		if candidateNumber != currentNumber {
			return candidateNumber > currentNumber
		}
	}
	return candidate != current && !strings.Contains(candidate, "-") && strings.Contains(current, "-")
}

func leadingVersionNumber(value string) int {
	number := 0
	for _, r := range value {
		if r < '0' || r > '9' {
			break
		}
		number = number*10 + int(r-'0')
	}
	return number
}
