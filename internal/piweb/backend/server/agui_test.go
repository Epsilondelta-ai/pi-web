package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAguiSessionRunStreamsProtocolEvents(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: false}, store, NewBroker())
	body := `{"threadId":"` + session.ID + `","runId":"run-test","messages":[{"id":"m1","role":"user","content":"hello ag-ui"}],"forwardedProps":{"text":"hello ag-ui"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/sessions/"+session.ID+"/ag-ui", bytes.NewBufferString(body))
	res := httptest.NewRecorder()

	server.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", res.Code, res.Body.String())
	}
	got := res.Body.String()
	for _, want := range []string{
		`"type":"RUN_STARTED"`,
		`"type":"TEXT_MESSAGE_START"`,
		`"type":"TEXT_MESSAGE_CONTENT"`,
		`Mock backend received your prompt`,
		`"type":"TEXT_MESSAGE_END"`,
		`"type":"RUN_FINISHED"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %s in SSE body:\n%s", want, got)
		}
	}
}

func TestAguiStreamPreservesWhitespaceOnlyTextDeltas(t *testing.T) {
	res := httptest.NewRecorder()
	stream := newAguiEventStream(res, t.Context())
	state := newAguiStreamState("thread", "run", "session")

	state.emitTextDelta("PR 올림: https://github.com/Epsilondelta-ai/pi-web/pull/62", stream)
	state.emitTextDelta("\n\n", stream)
	state.emitTextDelta("Checks:\n", stream)
	state.emitTextDelta("- Branch pushed\n- PR created\n- Working tree clean", stream)

	got := res.Body.String()
	if !strings.Contains(got, `"delta":"\n\n"`) {
		t.Fatalf("missing blank-line delta in SSE body:\n%s", got)
	}
	if !strings.Contains(got, `"delta":"Checks:\n"`) {
		t.Fatalf("missing line-break delta in SSE body:\n%s", got)
	}
}

func TestAguiSessionRunRejectsMissingText(t *testing.T) {
	t.Setenv("PI_CODING_AGENT_SESSION_DIR", t.TempDir())
	store := NewMockStore()
	workspace, err := store.OpenWorkspace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.CreateSession(workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Config{EnablePiExecution: false}, store, NewBroker())
	req := httptest.NewRequest(http.MethodPost, "/api/sessions/"+session.ID+"/ag-ui", strings.NewReader(`{"threadId":"t","runId":"r","messages":[]}`))
	res := httptest.NewRecorder()

	server.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "text is required") {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}
}
