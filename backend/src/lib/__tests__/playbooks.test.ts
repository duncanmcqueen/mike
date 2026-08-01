import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAssistantPlaybookContext,
  deletePlaybook,
  ensurePlaybookSchema,
  getPlaybook,
  listPlaybooks,
  playbookContentSchema,
  publishPlaybook,
  updatePlaybookDraft,
} from "../playbooks";
import { createServerSQLite } from "../sqlite";

const created: Array<{ id: string; userId: string }> = [];

function content(name = "Commercial Playbook") {
  return {
    name,
    description: "Standard commercial positions",
    globalGuidance: "Protect the customer.",
    representedParty: "Customer",
    documentTypes: ["MSA"],
    jurisdictions: ["New York"],
    topics: [{
      id: "liability",
      name: "Liability",
      rules: [{
        id: "liability-cap",
        name: "Liability cap",
        concept: "Determine whether liability is capped.",
        scope: "clause" as const,
        required: true,
        guidance: "Escalate uncapped liability.",
        standard: { name: "Standard", criteria: "Cap at fees paid in 12 months.", sampleClauses: [{ text: "Liability will not exceed fees paid in the preceding 12 months.", usage: "preferred" as const, sourceRefs: [] }] },
        fallbacks: [], unacceptable: [], conditions: [], actions: [], sourceRefs: [],
      }],
    }],
  };
}

async function seed(userId: string) {
  ensurePlaybookSchema();
  const db = createServerSQLite();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const draft = playbookContentSchema.parse(content());
  const result = await db.from("playbooks").insert({ id, user_id: userId, name: draft.name, description: draft.description, status: "draft", draft_json: draft, published_version_id: null, source_filename: null, source_storage_key: null, source_structure_json: null, import_model: null, created_at: now, updated_at: now });
  if (result.error) throw result.error;
  created.push({ id, userId });
  return id;
}

afterEach(async () => {
  const db = createServerSQLite();
  for (const item of created.splice(0)) {
    await db.from("playbook_runs").delete().eq("playbook_id", item.id);
    await db.from("playbook_versions").delete().eq("playbook_id", item.id);
    await db.from("playbooks").delete().eq("id", item.id);
  }
});

describe("playbook persistence", () => {
  it("updates a draft and publishes immutable numbered versions", async () => {
    const userId = crypto.randomUUID();
    const id = await seed(userId);
    const updated = await updatePlaybookDraft(userId, id, content("Updated Playbook"));
    expect(updated.name).toBe("Updated Playbook");
    expect(updated.status).toBe("draft");

    const first = await publishPlaybook(userId, id);
    expect(first).toMatchObject({ status: "published", publishedVersionNumber: 1 });
    const second = await publishPlaybook(userId, id);
    expect(second).toMatchObject({ status: "published", publishedVersionNumber: 2 });
    expect(second.publishedVersionId).not.toBe(first.publishedVersionId);
    expect((await listPlaybooks(userId)).map((item) => item.id)).toContain(id);
  });

  it("enforces ownership and removes associated versions", async () => {
    const userId = crypto.randomUUID();
    const id = await seed(userId);
    await expect(getPlaybook("another-user", id)).rejects.toThrow(/not found/i);
    await publishPlaybook(userId, id);
    await deletePlaybook(userId, id);
    created.splice(created.findIndex((item) => item.id === id), 1);
    await expect(getPlaybook(userId, id)).rejects.toThrow(/not found/i);
    const db = createServerSQLite();
    const versions = await db.from("playbook_versions").select("id").eq("playbook_id", id);
    expect(versions.data).toEqual([]);
  });

  it("rejects empty playbooks and invalid clause usage", () => {
    expect(() => playbookContentSchema.parse({ ...content(), topics: [] })).toThrow();
    const invalid = content();
    invalid.topics[0].rules[0].standard!.sampleClauses[0].usage = "sometimes" as "preferred";
    expect(() => playbookContentSchema.parse(invalid)).toThrow();
  });

  it("builds Assistant context from the immutable published version", async () => {
    const userId = crypto.randomUUID();
    const id = await seed(userId);
    const first = await publishPlaybook(userId, id);
    await updatePlaybookDraft(userId, id, content("Unpublished Revision"));
    await publishPlaybook(userId, id);

    const context = await buildAssistantPlaybookContext(
      userId,
      id,
      createServerSQLite(),
      first.publishedVersionId!,
    );

    expect(context.prompt).toContain("ACTIVE PUBLISHED PLAYBOOK");
    expect(context.prompt).toContain("Commercial Playbook");
    expect(context.prompt).toContain("version 1");
    expect(context.prompt).toContain("Cap at fees paid in 12 months.");
    expect(context.prompt).not.toContain("Unpublished Revision");
    expect(context.selection).toEqual({
      id,
      title: "Commercial Playbook",
      version: 1,
      versionId: expect.any(String),
    });
  });

  it("does not expose drafts to Assistant", async () => {
    const userId = crypto.randomUUID();
    const id = await seed(userId);
    await expect(buildAssistantPlaybookContext(userId, id)).rejects.toThrow(
      /publish the playbook/i,
    );
  });
});
