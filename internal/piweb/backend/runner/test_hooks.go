package runner

func (r *Runner) MarkRunningForTest(sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.running[sessionID] = &activePiRun{}
}
