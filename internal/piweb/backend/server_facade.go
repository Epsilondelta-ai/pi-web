package backend

import backendserver "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/server"

type Config = backendserver.Config
type Server = backendserver.Server
type Broker = backendserver.Broker

func NewServer(config Config, store *Store, broker *Broker) *Server {
	return backendserver.NewServer(config, store, broker)
}

func NewBroker() *Broker { return backendserver.NewBroker() }
