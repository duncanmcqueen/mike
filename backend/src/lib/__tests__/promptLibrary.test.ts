import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
    createPromptLibraryItem,
    deletePromptLibraryItem,
    getPromptLibraryItem,
    listBuiltInPrompts,
    listPromptLibrary,
    updatePromptLibraryItem,
} from "../promptLibrary";
import { createServerSQLite } from "../sqlite";

const createdPromptIds: string[] = [];

afterEach(async () => {
    const db = createServerSQLite();
    for (const id of createdPromptIds.splice(0)) {
        await db.from("saved_prompts").delete().eq("id", id);
    }
});

describe("built-in prompt library", () => {
    it("loads every prompt row from the Mike example workbook snapshot", () => {
        const prompts = listBuiltInPrompts();
        expect(prompts).toHaveLength(108);
        expect(new Set(prompts.map((prompt) => prompt.prompt)).size).toBe(106);
        expect(prompts.every((prompt) => prompt.source === "built_in")).toBe(true);
        expect(prompts.some((prompt) => prompt.categories.includes("Analyze"))).toBe(true);
        expect(prompts.some((prompt) => prompt.practiceAreas.includes("Litigation (General)"))).toBe(true);
    });

    it("returns defensive copies and rejects built-in mutations", async () => {
        const [prompt] = listBuiltInPrompts();
        prompt.categories.push("Changed");
        expect(listBuiltInPrompts()[0].categories).not.toContain("Changed");
        await expect(deletePromptLibraryItem("u1", prompt.id)).rejects.toThrow(/cannot be deleted/i);
        await expect(updatePromptLibraryItem("u1", prompt.id, { name: "Changed", prompt: "Changed" })).rejects.toThrow(/cannot be edited/i);
    });
});

describe("saved prompt persistence", () => {
    it("creates, lists, reads, updates, and deletes a user prompt", async () => {
        const userId = crypto.randomUUID();
        const created = await createPromptLibraryItem(userId, {
            name: "Review indemnity",
            prompt: "Review the attached agreement's indemnity provisions.",
            description: "Contract review starting point",
            promptType: "Assist",
            categories: ["Analyze", "Analyze"],
            practiceAreas: ["Commercial Transactions"],
            sourceRequirements: ["Files"],
        });
        createdPromptIds.push(created.id);

        expect(created).toMatchObject({
            userId,
            source: "user",
            categories: ["Analyze"],
            sourceRequirements: ["Files"],
        });
        const listed = await listPromptLibrary(userId);
        expect(listed[0]).toMatchObject({ id: created.id, name: "Review indemnity" });
        expect(listed).toHaveLength(109);
        await expect(getPromptLibraryItem(userId, created.id)).resolves.toMatchObject({ id: created.id });

        const updated = await updatePromptLibraryItem(userId, created.id, {
            name: "Review liability and indemnity",
            prompt: "Review liability, indemnity, and insurance provisions.",
            categories: ["Analyze", "Compare"],
        });
        expect(updated).toMatchObject({
            name: "Review liability and indemnity",
            categories: ["Analyze", "Compare"],
        });

        await deletePromptLibraryItem(userId, created.id);
        createdPromptIds.splice(createdPromptIds.indexOf(created.id), 1);
        await expect(getPromptLibraryItem(userId, created.id)).rejects.toThrow(/not found/i);
    });

    it("does not expose another user's custom prompt", async () => {
        const created = await createPromptLibraryItem("owner", { name: "Private prompt", prompt: "Private instructions" });
        createdPromptIds.push(created.id);
        await expect(getPromptLibraryItem("other", created.id)).rejects.toThrow(/not found/i);
        expect((await listPromptLibrary("other")).some((item) => item.id === created.id)).toBe(false);
    });

    it("validates required text and bounded metadata", async () => {
        await expect(createPromptLibraryItem("u1", { name: "", prompt: "Prompt" })).rejects.toThrow(/name is required/i);
        await expect(createPromptLibraryItem("u1", { name: "Name", prompt: "" })).rejects.toThrow(/prompt is required/i);
        await expect(createPromptLibraryItem("u1", {
            name: "Name",
            prompt: "Prompt",
            categories: Array.from({ length: 21 }, (_, index) => `Category ${index}`),
        })).rejects.toThrow(/at most 20/i);
    });
});
