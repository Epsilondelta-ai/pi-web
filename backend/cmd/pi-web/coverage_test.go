package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/blang/semver"
	"github.com/rhysd/go-github-selfupdate/selfupdate"

	"github.com/Epsilondelta-ai/pi-web/backend/internal/piweb"
)

func TestMainSuccessAndError(t *testing.T) {
	previousCommand := newRootCommandForMain
	previousDeps := defaultRootDependenciesForMain
	previousStderr := stderrForMain
	previousExit := exitForMain
	t.Cleanup(func() {
		newRootCommandForMain = previousCommand
		defaultRootDependenciesForMain = previousDeps
		stderrForMain = previousStderr
		exitForMain = previousExit
	})

	defaultRootDependenciesForMain = func() rootDependencies { return rootDependencies{stdout: io.Discard} }
	newRootCommandForMain = func(rootDependencies) rootCommandExecutor {
		return commandFunc(func() error { return nil })
	}
	main()

	var stderr bytes.Buffer
	var exitCode int
	stderrForMain = &stderr
	exitForMain = func(code int) { exitCode = code }
	newRootCommandForMain = func(rootDependencies) rootCommandExecutor {
		return commandFunc(func() error { return errors.New("boom") })
	}
	main()
	if exitCode != 1 || !strings.Contains(stderr.String(), "boom") {
		t.Fatalf("expected exit and stderr, code=%d stderr=%q", exitCode, stderr.String())
	}
}

type commandFunc func() error

func (f commandFunc) Execute() error { return f() }

func TestDefaultRootDependenciesAndStaticFiles(t *testing.T) {
	deps := defaultRootDependencies()
	if deps.stdout == nil || deps.stderr == nil || deps.serve == nil || deps.update == nil {
		t.Fatalf("incomplete dependencies: %+v", deps)
	}
	if _, err := fs.Stat(staticFiles(), "README.txt"); err != nil {
		t.Fatalf("static files missing README: %v", err)
	}
	if _, err := fs.Stat(mustSub(fstest.MapFS{"dir/file.txt": {Data: []byte("ok")}}, "dir"), "file.txt"); err != nil {
		t.Fatalf("mustSub success: %v", err)
	}
	defer func() {
		if recover() == nil {
			t.Fatal("expected mustSub panic")
		}
	}()
	_ = mustSub(fstest.MapFS{}, "../missing")
}

func TestRunServerWithDependencies(t *testing.T) {
	base := func() serverDependencies {
		return serverDependencies{
			newAutoStore:  piweb.NewMockStore,
			newMockStore:  piweb.NewMockStore,
			newServer:     piweb.NewServer,
			newBroker:     piweb.NewBroker,
			staticFiles:   func() fs.FS { return fstest.MapFS{"index.html": {Data: []byte("ok")}} },
			versionStatus: func(context.Context, string) (piweb.VersionStatus, error) { return piweb.VersionStatus{}, nil },
			listen:        func(*http.Server) error { return http.ErrServerClosed },
			shutdown:      func(*http.Server, context.Context) error { return nil },
			notify:        func(chan<- os.Signal, ...os.Signal) {},
			stopNotify:    func(chan<- os.Signal) {},
		}
	}

	if err := runServerWithDependencies(serverOptions{Host: "127.0.0.1", Port: "0"}, base()); err != nil {
		t.Fatalf("closed server should return nil: %v", err)
	}

	listenErr := errors.New("listen failed")
	deps := base()
	deps.listen = func(*http.Server) error { return listenErr }
	if err := runServerWithDependencies(serverOptions{}, deps); !errors.Is(err, listenErr) {
		t.Fatalf("expected listen error, got %v", err)
	}

	shutdownErr := errors.New("shutdown failed")
	deps = base()
	block := make(chan struct{})
	deps.listen = func(*http.Server) error {
		<-block
		return http.ErrServerClosed
	}
	deps.notify = func(stop chan<- os.Signal, _ ...os.Signal) { stop <- os.Interrupt }
	deps.shutdown = func(*http.Server, context.Context) error {
		close(block)
		return shutdownErr
	}
	if err := runServerWithDependencies(serverOptions{Mock: true}, deps); !errors.Is(err, shutdownErr) {
		t.Fatalf("expected shutdown error, got %v", err)
	}

	deps = base()
	block = make(chan struct{})
	deps.listen = func(*http.Server) error {
		<-block
		return http.ErrServerClosed
	}
	deps.notify = func(stop chan<- os.Signal, _ ...os.Signal) { stop <- os.Interrupt }
	deps.shutdown = func(*http.Server, context.Context) error {
		close(block)
		return nil
	}
	if err := runServerWithDependencies(serverOptions{Mock: true}, deps); err != nil {
		t.Fatalf("expected clean shutdown, got %v", err)
	}
}

func TestDefaultServerDependencies(t *testing.T) {
	deps := defaultServerDependencies()
	if deps.newAutoStore == nil || deps.newMockStore == nil || deps.newServer == nil || deps.newBroker == nil ||
		deps.staticFiles == nil || deps.versionStatus == nil || deps.listen == nil || deps.shutdown == nil ||
		deps.notify == nil || deps.stopNotify == nil {
		t.Fatalf("incomplete server dependencies: %+v", deps)
	}
}

func TestRunServerWrapperUsesDefaults(t *testing.T) {
	previous := defaultServerDependenciesForRun
	t.Cleanup(func() { defaultServerDependenciesForRun = previous })
	deps := serverDependencies{
		newAutoStore:  piweb.NewMockStore,
		newMockStore:  piweb.NewMockStore,
		newServer:     piweb.NewServer,
		newBroker:     piweb.NewBroker,
		staticFiles:   func() fs.FS { return fstest.MapFS{"index.html": {Data: []byte("ok")}} },
		versionStatus: func(context.Context, string) (piweb.VersionStatus, error) { return piweb.VersionStatus{}, nil },
		listen:        func(*http.Server) error { return http.ErrServerClosed },
		shutdown:      func(*http.Server, context.Context) error { return nil },
		notify:        func(chan<- os.Signal, ...os.Signal) {},
		stopNotify:    func(chan<- os.Signal) {},
	}
	defaultServerDependenciesForRun = func() serverDependencies { return deps }
	if err := runServer(serverOptions{}); err != nil {
		t.Fatalf("runServer wrapper: %v", err)
	}
}

func TestRunUpdateAndReleaseStatusSeams(t *testing.T) {
	previousUpdater := newSelfUpdater
	previousDetector := newReleaseDetector
	t.Cleanup(func() { newSelfUpdater = previousUpdater; newReleaseDetector = previousDetector })

	updateErr := errors.New("factory")
	newSelfUpdater = func() (binaryUpdater, error) { return nil, updateErr }
	if err := runUpdate(io.Discard, updateOptions{CurrentVersion: "1.2.3"}); !errors.Is(err, updateErr) {
		t.Fatalf("expected factory error, got %v", err)
	}

	newSelfUpdater = func() (binaryUpdater, error) {
		return &fakeBinaryUpdater{releaseVersion: semver.MustParse("1.2.3")}, nil
	}
	if err := runUpdate(io.Discard, updateOptions{CurrentVersion: "1.2.3", RepositorySlug: "owner/repo"}); err != nil {
		t.Fatalf("runUpdate: %v", err)
	}

	status, err := detectReleaseStatus(context.Background(), "dev")
	if err != nil || status.CurrentVersion != "dev" || status.UpdateAvailable {
		t.Fatalf("unexpected dev status: %+v err=%v", status, err)
	}

	newReleaseDetector = func() (releaseDetector, error) { return nil, updateErr }
	if _, err := detectReleaseStatus(context.Background(), "1.2.3"); !errors.Is(err, updateErr) {
		t.Fatalf("expected detector factory error, got %v", err)
	}

	newReleaseDetector = func() (releaseDetector, error) {
		return &fakeReleaseDetector{release: &selfupdate.Release{Version: semver.MustParse("1.2.4")}}, nil
	}
	status, err = detectReleaseStatus(context.Background(), "1.2.3")
	if err != nil || status.LatestVersion != "1.2.4" || !status.UpdateAvailable {
		t.Fatalf("unexpected newer status: %+v err=%v", status, err)
	}

	newReleaseDetector = func() (releaseDetector, error) {
		return &fakeReleaseDetector{release: &selfupdate.Release{Version: semver.MustParse("1.2.3")}}, nil
	}
	status, err = detectReleaseStatus(context.Background(), "1.2.3")
	if err != nil || status.UpdateAvailable {
		t.Fatalf("unexpected current status: %+v err=%v", status, err)
	}

	detectErr := errors.New("detect")
	newReleaseDetector = func() (releaseDetector, error) { return &fakeReleaseDetector{err: detectErr}, nil }
	if _, err := detectReleaseStatus(context.Background(), "1.2.3"); !errors.Is(err, detectErr) {
		t.Fatalf("expected detect error, got %v", err)
	}

	newReleaseDetector = func() (releaseDetector, error) { return &fakeReleaseDetector{}, nil }
	status, err = detectReleaseStatus(context.Background(), "1.2.3")
	if err != nil || status.LatestVersion != "" || status.UpdateAvailable {
		t.Fatalf("unexpected missing release status: %+v err=%v", status, err)
	}
}

func TestGitHubSelfUpdaterEdges(t *testing.T) {
	executableErr := errors.New("executable")
	updater := &githubSelfUpdater{executable: func() (string, error) { return "", executableErr }}
	if _, err := updater.UpdateSelf(semver.MustParse("1.2.3"), "owner/repo"); !errors.Is(err, executableErr) {
		t.Fatalf("expected executable error, got %v", err)
	}

	cmd := filepath.Join(t.TempDir(), "pi-web")
	if err := os.WriteFile(cmd, []byte("bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	updater = &githubSelfUpdater{
		executable: func() (string, error) { return cmd, nil },
		detector:   &fakeReleaseDetector{release: &selfupdate.Release{Version: semver.MustParse("1.2.3")}},
		updateTo:   func(string, string) error { t.Fatal("update should not run"); return nil },
	}
	if release, err := updater.UpdateSelf(semver.MustParse("1.2.3"), "owner/repo"); err != nil || !release.Version.Equals(semver.MustParse("1.2.3")) {
		t.Fatalf("unexpected release=%v err=%v", release, err)
	}

	if _, err := updater.updateCommand(filepath.Join(t.TempDir(), "missing"), semver.MustParse("1.2.3"), "owner/repo"); err == nil {
		t.Fatal("expected missing stat error")
	}

	broken := filepath.Join(t.TempDir(), "broken")
	if err := os.Symlink(filepath.Join(t.TempDir(), "missing"), broken); err != nil {
		t.Fatal(err)
	}
	if _, err := updater.updateCommand(broken, semver.MustParse("1.2.3"), "owner/repo"); err == nil {
		t.Fatal("expected broken symlink error")
	}

	target := filepath.Join(t.TempDir(), "target")
	if err := os.WriteFile(target, []byte("bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	var gotPath string
	updater = &githubSelfUpdater{
		detector: &fakeReleaseDetector{release: &selfupdate.Release{
			Version:  semver.MustParse("1.2.4"),
			AssetURL: "asset",
		}},
		updateTo: func(_ string, cmdPath string) error { gotPath = cmdPath; return nil },
	}
	if _, err := updater.updateCommand(link, semver.MustParse("1.2.3"), "owner/repo"); err != nil {
		t.Fatalf("update symlink: %v", err)
	}
	if gotPath != target {
		t.Fatalf("expected resolved symlink path %q, got %q", target, gotPath)
	}

	detectErr := errors.New("detect")
	updater = &githubSelfUpdater{detector: &fakeReleaseDetector{err: detectErr}}
	if _, err := updater.updateCommand(cmd, semver.MustParse("1.2.3"), "owner/repo"); !errors.Is(err, detectErr) {
		t.Fatalf("expected detector error, got %v", err)
	}

	updateErr := errors.New("update")
	updater = &githubSelfUpdater{
		detector: &fakeReleaseDetector{release: &selfupdate.Release{Version: semver.MustParse("1.2.4")}},
		updateTo: func(string, string) error { return updateErr },
	}
	if _, err := updater.updateCommand(cmd, semver.MustParse("1.2.3"), "owner/repo"); !errors.Is(err, updateErr) {
		t.Fatalf("expected update error, got %v", err)
	}

	if got := commandPathForGOOS("windows", `C:\\pi-web`); got != `C:\\pi-web.exe` {
		t.Fatalf("unexpected windows path: %q", got)
	}
	if got := commandPathForGOOS("windows", `C:\\pi-web.exe`); got != `C:\\pi-web.exe` {
		t.Fatalf("unexpected windows exe path: %q", got)
	}
	if got := commandPathForGOOS("linux", "/tmp/pi-web"); got != "/tmp/pi-web" {
		t.Fatalf("unexpected linux path: %q", got)
	}
	updater = &githubSelfUpdater{detector: &fakeReleaseDetector{}}
	release, found, err := updater.DetectLatest("owner/repo")
	if err != nil || found || release != nil {
		t.Fatalf("unexpected detector result release=%v found=%v err=%v", release, found, err)
	}
}

func TestNewGitHubSelfUpdater(t *testing.T) {
	previous := newSelfupdateUpdater
	t.Cleanup(func() { newSelfupdateUpdater = previous })

	updater, err := newGitHubSelfUpdater()
	if err != nil {
		t.Fatalf("newGitHubSelfUpdater: %v", err)
	}
	if updater.detector == nil || updater.updateTo == nil || updater.executable == nil {
		t.Fatalf("incomplete updater: %+v", updater)
	}

	factoryErr := errors.New("selfupdate")
	newSelfupdateUpdater = func(selfupdate.Config) (*selfupdate.Updater, error) { return nil, factoryErr }
	if _, err := newGitHubSelfUpdater(); !errors.Is(err, factoryErr) {
		t.Fatalf("expected factory error, got %v", err)
	}
}

func TestRunUpdateErrors(t *testing.T) {
	parseErr := runUpdateWithUpdater(io.Discard, updateOptions{CurrentVersion: "not-semver"}, &fakeBinaryUpdater{})
	if parseErr == nil {
		t.Fatal("expected parse error")
	}

	updateErr := errors.New("update")
	err := runUpdateWithUpdater(io.Discard, updateOptions{CurrentVersion: "1.2.3"}, &fakeBinaryUpdater{err: updateErr})
	if !errors.Is(err, updateErr) {
		t.Fatalf("expected update error, got %v", err)
	}
}
