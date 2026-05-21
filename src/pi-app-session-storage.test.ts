// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoredActiveSession, readStoredActiveSession, storeActiveSession } from "./pi-app/session-storage";

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    removeItem: vi.fn((key) => data.delete(key)),
  };
}

describe("active session storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads only valid stored sessions", () => {
    expect(readStoredActiveSession()).toBeUndefined();
    localStorage.getItem.mockReturnValueOnce("not-json");
    expect(readStoredActiveSession()).toBeUndefined();
    localStorage.getItem.mockReturnValueOnce(JSON.stringify({ sessionId: "" }));
    expect(readStoredActiveSession()).toBeUndefined();
    localStorage.getItem.mockReturnValueOnce(JSON.stringify({ sessionId: 1 }));
    expect(readStoredActiveSession()).toBeUndefined();
    localStorage.getItem.mockReturnValueOnce(JSON.stringify({ sessionId: "s1", workspaceId: 1 }));
    expect(readStoredActiveSession()).toEqual({ workspaceId: "", sessionId: "s1" });
    localStorage.getItem.mockReturnValueOnce(JSON.stringify({ sessionId: "s1", workspaceId: "w1" }));
    expect(readStoredActiveSession()).toEqual({ workspaceId: "w1", sessionId: "s1" });
  });

  it("stores sessions and swallows storage errors", () => {
    storeActiveSession("w1", "");
    expect(localStorage.setItem).not.toHaveBeenCalled();
    storeActiveSession(undefined, "s1");
    expect(JSON.parse(localStorage.setItem.mock.calls[0][1])).toEqual({ workspaceId: "", sessionId: "s1" });
    localStorage.setItem.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() => storeActiveSession("w1", "s2")).not.toThrow();
  });

  it("clears matching sessions and keeps non-matching sessions", () => {
    vi.stubGlobal("localStorage", storage({ "pi.activeSession": JSON.stringify({ workspaceId: "w1", sessionId: "s1" }) }));
    clearStoredActiveSession("s2");
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    clearStoredActiveSession("s1");
    expect(localStorage.removeItem).toHaveBeenCalledWith("pi.activeSession");
    clearStoredActiveSession();
    expect(localStorage.removeItem).toHaveBeenCalledTimes(2);
    localStorage.getItem.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(() => clearStoredActiveSession("s1")).not.toThrow();
  });
});
