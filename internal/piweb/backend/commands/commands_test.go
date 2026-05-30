package commands

import "testing"

func TestParseCommandsRPCLineNormalizesScope(t *testing.T) {
	line := `{"id":"commands","type":"response","command":"get_commands","success":true,"data":{"commands":[{"name":"fix","description":"Fix tests","source":"prompt","sourceInfo":{"path":"/repo/.pi/prompts/fix.md","scope":"project"}},{"name":"skill:review","description":"Review code","source":"skill","sourceInfo":{"path":"/home/me/.pi/agent/skills/review/SKILL.md","scope":"user"}}]}}`
	commands, matched, err := parseCommandsRPCLine(line)
	if err != nil {
		t.Fatal(err)
	}
	if !matched {
		t.Fatal("expected matching get_commands response")
	}
	if len(commands) != 2 {
		t.Fatalf("expected 2 commands, got %d", len(commands))
	}
	if commands[0].Command != "/fix" || commands[0].Scope != "project" {
		t.Fatalf("unexpected first command: %+v", commands[0])
	}
	if commands[1].Command != "/skill:review" || commands[1].Scope != "global" {
		t.Fatalf("unexpected second command: %+v", commands[1])
	}
}
