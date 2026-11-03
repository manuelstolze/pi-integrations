import { describe, expect, it, vi } from "vitest";
import { createDescriptionUpdates } from "../src/application/use-cases/update-description.js";
import { doc, harness, snapshot } from "./description-fixtures.js";

function setup() {
  const h = harness();
  let saved = snapshot();
  const jira = {
    readDescription: vi.fn(async () => structuredClone(saved)),
    replaceDescription: vi.fn(async (p: { description: unknown }) => { saved.descriptionDocument = p.description as typeof saved.descriptionDocument; return {}; }),
  };
  const updates = createDescriptionUpdates(jira, h.conversation);
  async function prepare(approve = true) {
    const result = await updates.execute({ action: "prepare", issueKey: "D3X-123", description: doc() });
    h.publish(result.proposal!);
    if (approve) h.user(`Approve Jira update ${result.proposalId}`);
    return result.proposalId!;
  }
  return { ...h, jira, updates, prepare, saved };
}

describe("description application", () => {
  it("prepares without writing and applies the exact approved document once (AC-001)", async () => {
    const h = setup();
    const id = await h.prepare();
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
    const result = await h.updates.execute({ action: "apply", proposalId: id });
    expect(result).toMatchObject({ status: "verified", writeAttempted: true });
    expect(h.jira.replaceDescription).toHaveBeenCalledTimes(1);
    expect(h.jira.replaceDescription.mock.calls[0]![0].description).toEqual(doc());
    expect(Object.keys(h.jira.replaceDescription.mock.calls[0]![0].snapshot.issue)).toEqual(["key"]);
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "approval-required", writeAttempted: false });
  });
  it("requires actual conversation approval, not a proposal ID (AC-007)", async () => {
    const h = setup();
    const id = await h.prepare(false);
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "approval-required" });
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
  });
  it.each(["description", "site", "account"])("blocks a changed %s and consumes approval (AC-008/009)", async (field) => {
    const h = setup();
    const id = await h.prepare();
    if (field === "description") h.saved.descriptionDocument = doc("Other edit");
    else h.saved.target[field] = "changed.example.com";
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "conflict", writeAttempted: false });
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "approval-required" });
  });
  it("allows a known empty description and rejects an unknown snapshot (AC-005)", async () => {
    const h = setup(); h.saved.descriptionDocument = null;
    expect(await h.updates.execute({ action: "apply", proposalId: await h.prepare() })).toMatchObject({ status: "verified" });
    h.jira.readDescription.mockRejectedValueOnce(new Error("Missing description"));
    await expect(h.prepare()).rejects.toThrow("Missing description");
  });
  it("serializes concurrent applies so approval cannot be reused", async () => {
    const h = setup(); const id = await h.prepare();
    const results = await Promise.all([h.updates.execute({ action: "apply", proposalId: id }), h.updates.execute({ action: "apply", proposalId: id })]);
    expect(results.map((r) => r.status)).toEqual(["verified", "approval-required"]);
    expect(h.jira.replaceDescription).toHaveBeenCalledTimes(1);
  });
  it.each(["permission denied", "ADF rejected", "timeout"])("reports %s and verifies unchanged state without retry (AC-010/011)", async (message) => {
    const h = setup(); const id = await h.prepare();
    h.jira.replaceDescription.mockImplementationOnce(async () => { throw new Error(message); });
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "unchanged", error: message, writeAttempted: true });
    expect(h.jira.replaceDescription).toHaveBeenCalledTimes(1);
  });
  it("reports a structural mismatch even when visible text matches (AC-012)", async () => {
    const h = setup(); const id = await h.prepare();
    h.jira.replaceDescription.mockImplementationOnce(async () => { h.saved.descriptionDocument = { ...doc(), content: [{ type: "paragraph", attrs: { localId: "server-added" }, content: [{ type: "text", text: "New description" }] }] }; return {}; });
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "different" });
  });
  it("reports unknown when verification is unreadable (AC-012)", async () => {
    const h = setup(); const id = await h.prepare();
    h.jira.replaceDescription.mockImplementationOnce(async () => { h.jira.readDescription.mockRejectedValue(new Error("No read-back")); return {}; });
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "unknown" });
  });
  it("uses an independent verification signal after submission cancellation (AC-013)", async () => {
    const h = setup(); const id = await h.prepare(); const controller = new AbortController();
    h.jira.replaceDescription.mockImplementationOnce(async () => { controller.abort(); h.saved.descriptionDocument = doc(); throw new Error("cancelled after submission"); });
    expect(await h.updates.execute({ action: "apply", proposalId: id }, controller.signal)).toMatchObject({ status: "verified", error: "cancelled after submission" });
    const signal = h.jira.readDescription.mock.calls.at(-1)?.[1];
    expect(signal).not.toBe(controller.signal);
    expect(h.jira.replaceDescription).toHaveBeenCalledTimes(1);
  });
  it("never writes after pre-submission cancellation", async () => {
    const h = setup(); const id = await h.prepare();
    const controller = new AbortController(); controller.abort();
    await expect(h.updates.execute({ action: "apply", proposalId: id }, controller.signal)).rejects.toThrow("cancelled");
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
  });
  it("blocks a failed intent record and reports a failed outcome record (AC-014)", async () => {
    const h = setup(); const id = await h.prepare();
    const original = h.conversation.record.bind(h.conversation);
    vi.spyOn(h.conversation, "record").mockImplementation((_id, _result, stage) => { if (stage === "intent") throw new Error("storage"); });
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "rejected", writeAttempted: false });
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
    vi.mocked(h.conversation.record).mockImplementation((key, result, stage) => { if (stage !== "intent") throw new Error("storage"); original(key, result, stage); });
    const next = await h.prepare();
    expect(await h.updates.execute({ action: "apply", proposalId: next })).toMatchObject({ status: "verified", recordError: expect.any(String) });
  });
  it("honors a conversation cancellation while final checks are running", async () => {
    const h = setup(); const id = await h.prepare();
    h.jira.readDescription.mockImplementationOnce(async () => {
      h.user(`Cancel Jira update ${id}`);
      return structuredClone(h.saved);
    });
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "cancelled-before-write", writeAttempted: false });
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
  });
  it("does not claim submission when the adapter blocks before spawning ACLI", async () => {
    const h = setup(); const id = await h.prepare();
    h.jira.replaceDescription.mockResolvedValueOnce({ writeAttempted: false, error: "Account changed before submission" });
    expect(await h.updates.execute({ action: "apply", proposalId: id })).toMatchObject({ status: "rejected", writeAttempted: false });
    expect(h.jira.readDescription).toHaveBeenCalledTimes(2);
  });
  it("blocks failed proposal and consumed-state records before writing", async () => {
    const h = setup();
    const create = vi.spyOn(h.conversation, "create").mockImplementationOnce(() => { throw new Error("Record failed"); });
    await expect(h.prepare()).rejects.toThrow("Record failed");
    create.mockRestore();
    const id = await h.prepare();
    vi.spyOn(h.conversation, "consume").mockImplementationOnce(() => { throw new Error("Consumed-state record failed"); });
    await expect(h.updates.execute({ action: "apply", proposalId: id })).rejects.toThrow("Consumed-state record failed");
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
  });
  it("blocks invalid prepare/apply requests before accessing Jira (AC-002/003/004)", async () => {
    const h = setup();
    for (const input of [{ action: "prepare", issueKey: "D3X-1,OTHER-2", description: doc() }, { action: "prepare", issueKey: "D3X-1", description: "text" }, { action: "prepare", issueKey: "D3X-1", description: doc(" ") }, { action: "apply", proposalId: "id", approved: true }]) await expect(h.updates.execute(input)).rejects.toThrow();
    expect(h.jira.readDescription).not.toHaveBeenCalled();
    expect(h.jira.replaceDescription).not.toHaveBeenCalled();
  });
});
