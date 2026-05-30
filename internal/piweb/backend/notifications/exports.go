package notifications

func NotifyRemoteResponseCompleted(root string, session Session, messages []Message) error {
	return notifyRemoteResponseCompleted(root, session, messages)
}

func NotifyRemoteResponseCompletedForFile(root string, sessionFile string, session Session, messages []Message) error {
	return notifyRemoteResponseCompletedForFile(root, sessionFile, session, messages)
}

func NotifyRemoteChoiceQuestion(root string, session Session, messages []Message) error {
	return notifyRemoteChoiceQuestion(root, session, messages)
}
