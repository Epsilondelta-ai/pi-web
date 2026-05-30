package backend

import backendrunner "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/runner"

type Runner = backendrunner.Runner

func NewRunner() *Runner { return backendrunner.NewRunner() }
