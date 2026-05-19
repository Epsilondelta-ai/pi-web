package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pi-web-ui/backend/internal/piweb"
)

func runServer(options serverOptions) error {
	store := piweb.NewAutoStore()
	if options.Mock {
		store = piweb.NewMockStore()
	}

	server := piweb.NewServer(piweb.Config{
		Host:              options.Host,
		Port:              options.Port,
		EnablePiExecution: !options.Mock,
		StaticFiles:       staticFiles(),
	}, store, piweb.NewBroker())
	httpServer := &http.Server{
		Addr:              server.Addr(),
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("pi web backend listening", "addr", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
			return
		}
		serverErrors <- nil
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)

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
	if err := httpServer.Shutdown(ctx); err != nil {
		slog.Error("shutdown failed", "error", err)
		return err
	}
	slog.Info("pi web backend stopped")
	return nil
}
