import { describe, it, expect } from "vitest";
import { selectRuntimeSession, readStoredRuntimeSession } from "./runtimeSessionSelection";
const saved = { runtimeToken: "old-token", trackerUserId: "user-a", orgId: "org-a" };
describe("runtime identity handoff", () => {
  it("does not combine a URL org with a stored credential", () => {
    expect(selectRuntimeSession({ orgId: "org-b" }, saved)).toEqual(saved);
  });
  it("does not combine a new token with an old identity", () => {
    expect(selectRuntimeSession({ runtimeToken: "new-token" }, saved)).toEqual(saved);
  });
  it("accepts an explicit complete session in another org", () => {
    const fresh = {runtimeToken:"new-token",trackerUserId:"user-b",orgId:"org-b"};
    expect(selectRuntimeSession(fresh,saved)).toEqual(fresh);
  });
  it("does not obtain runtime user identity from generic auth storage", () => {
    const values={tracker_runtime_token:"token",user_id:"owner",org_id:"org"};
    expect(readStoredRuntimeSession({getItem:k=>values[k]})).toBeNull();
  });
  it("rejects conflicting organization aliases", () => {
    const values={tracker_runtime_token:"token",tracker_user_id:"user",tracker_org_id:"a",org_id:"b"};
    expect(readStoredRuntimeSession({getItem:k=>values[k]})).toBeNull();
  });
});
