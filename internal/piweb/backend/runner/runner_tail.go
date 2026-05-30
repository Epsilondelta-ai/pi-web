package runner

import (
	"bufio"
	"context"
	"io"
	"os"
	"sync/atomic"
	"time"
)

func tailSessionFile(ctx context.Context, events EventSink, store SessionMessageStore, sessionID, path string, offset int64, emitted *atomic.Int64, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(120 * time.Millisecond)
	defer ticker.Stop()
	idleAfterCancel := time.NewTimer(500 * time.Millisecond)
	if !idleAfterCancel.Stop() {
		<-idleAfterCancel.C
	}
	for {
		newOffset := readSessionLines(path, offset, func(line string) {
			for _, msg := range ParsePiSessionLineMessages(line) {
				_ = store.AppendMessage(sessionID, msg)
				events.Publish(sessionID, eventTypeForMessage(msg), msg)
				emitted.Add(1)
			}
		})
		if newOffset > offset {
			offset = newOffset
		}
		select {
		case <-ctx.Done():
			idleAfterCancel.Reset(500 * time.Millisecond)
			select {
			case <-idleAfterCancel.C:
				readSessionLines(path, offset, func(line string) {
					for _, msg := range ParsePiSessionLineMessages(line) {
						_ = store.AppendMessage(sessionID, msg)
						events.Publish(sessionID, eventTypeForMessage(msg), msg)
						emitted.Add(1)
					}
				})
				return
			case <-ticker.C:
				continue
			}
		case <-ticker.C:
		}
	}
}
func readSessionLines(path string, offset int64, onLine func(string)) int64 {
	file, err := os.Open(path)
	if err != nil {
		return offset
	}
	defer file.Close()
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return offset
	}
	reader := bufio.NewReader(file)
	for {
		line, err := reader.ReadString('\n')
		if line != "" && err == nil {
			offset += int64(len(line))
			onLine(line)
		}
		if err != nil {
			break
		}
	}
	return offset
}
func waitForTail(done <-chan struct{}) {
	select {
	case <-done:
	case <-time.After(700 * time.Millisecond):
	}
}
func fileSize(path string) int64 {
	stat, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return stat.Size()
}
