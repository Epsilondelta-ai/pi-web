package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pi-web-ui/backend/internal/piweb"
)

type serverDependencies struct {
	newAutoStore  func() *piweb.Store
	newMockStore  func() *piweb.Store
	newServer     func(piweb.Config, *piweb.Store, *piweb.Broker) *piweb.Server
	newBroker     func() *piweb.Broker
	staticFiles   func() fs.FS
	versionStatus func(context.Context, string) (piweb.VersionStatus, error)
	listen        func(*http.Server) error
	shutdown      func(*http.Server, context.Context) error
	notify        func(chan<- os.Signal, ...os.Signal)
	stopNotify    func(chan<- os.Signal)
}

func defaultServerDependencies() serverDependencies {
	return serverDependencies{
		newAutoStore:  piweb.NewAutoStore,
		newMockStore:  piweb.NewMockStore,
		newServer:     piweb.NewServer,
		newBroker:     piweb.NewBroker,
		staticFiles:   staticFiles,
		versionStatus: detectReleaseStatus,
		listen:        (*http.Server).ListenAndServe,
		shutdown:      (*http.Server).Shutdown,
		notify:        signal.Notify,
		stopNotify:    signal.Stop,
	}
}

var defaultServerDependenciesForRun = defaultServerDependencies

func runServer(options serverOptions) error {
	return runServerWithDependencies(options, defaultServerDependenciesForRun())
}

func runServerWithDependencies(options serverOptions, deps serverDependencies) error {
	store := deps.newAutoStore()
	if options.Mock {
		store = deps.newMockStore()
	}

	server := deps.newServer(piweb.Config{
		Host:              options.Host,
		Port:              options.Port,
		EnablePiExecution: !options.Mock,
		StaticFiles:       deps.staticFiles(),
		CurrentVersion:    version,
		VersionStatus:     deps.versionStatus,
	}, store, deps.newBroker())
	httpServer := &http.Server{
		Addr:              server.Addr(),
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("pi web backend listening", "addr", httpServer.Addr)
		if err := deps.listen(httpServer); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
			return
		}
		serverErrors <- nil
	}()

	stop := make(chan os.Signal, 1)
	deps.notify(stop, os.Interrupt, syscall.SIGTERM)
	defer deps.stopNotify(stop)

	select {
	case err := <-serverErrors:
		if err != nil {
			slog.Error("server failed", "error", err)
			return err
		}
		return nil
	case <-stop:
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := deps.shutdown(httpServer, ctx); err != nil {
		slog.Error("shutdown failed", "error", err)
		return err
	}
	slog.Info("pi web backend stopped")
	return nil
}
