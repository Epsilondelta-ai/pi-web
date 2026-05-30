package backend

import backendnotifications "github.com/Epsilondelta-ai/pi-web/internal/piweb/backend/notifications"

func notifyRemoteResponseCompleted(root string, session Session, messages []Message) error {
	return backendnotifications.NotifyRemoteResponseCompleted(root, session, messages)
}

func notifyRemoteResponseCompletedForFile(root string, sessionFile string, session Session, messages []Message) error {
	return backendnotifications.NotifyRemoteResponseCompletedForFile(root, sessionFile, session, messages)
}

func notifyRemoteChoiceQuestion(root string, session Session, messages []Message) error {
	return backendnotifications.NotifyRemoteChoiceQuestion(root, session, messages)
}
