import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaybookConfiguration,
  listPlaybooks,
  reviewDocumentWithPlaybook,
  type Playbook,
  type PlaybookRun,
} from "@/app/lib/mikeApi";
import PlaybooksPage from "./page";

vi.mock("@/app/lib/mikeApi", () => ({
  listPlaybooks: vi.fn(),
  getPlaybookConfiguration: vi.fn(),
  importPlaybook: vi.fn(),
  updatePlaybook: vi.fn(),
  publishPlaybook: vi.fn(),
  deletePlaybook: vi.fn(),
  reviewDocumentWithPlaybook: vi.fn(),
}));

vi.mock("@/app/hooks/useOllamaModels", () => ({
  useOllamaModels: () => [],
}));

vi.mock("@/app/contexts/UserProfileContext", () => ({
  useUserProfile: () => ({ profile: null }),
}));

function playbook(id: string, name: string): Playbook {
  return {
    id,
    userId: "u1",
    name,
    description: "",
    status: "published",
    draft: {
      name,
      description: "",
      representedParty: "Customer",
      globalGuidance: "",
      documentTypes: [],
      jurisdictions: [],
      topics: [
        {
          id: `${id}-liability`,
          name: "Liability",
          rules: [
            {
              id: `${id}-cap`,
              name: "Liability cap",
              concept: "",
              scope: "clause",
              required: true,
              guidance: "",
              standard: null,
              fallbacks: [],
              unacceptable: [],
              conditions: [],
              actions: [],
              sourceRefs: [],
            },
          ],
        },
      ],
    },
    publishedVersionId: `${id}-v1`,
    publishedVersionNumber: 1,
    publishedName: name,
    sourceFilename: null,
    importModel: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Playbook;
}

const RUN: PlaybookRun = {
  id: "run-1",
  playbookId: "pb-a",
  versionId: "pb-a-v1",
  versionNumber: 1,
  model: "claude-opus-5",
  documentName: "contract.docx",
  reviewMode: "strict",
  status: "completed",
  summary: "Playbook A found an uncapped liability clause.",
  findings: [],
  error: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:01:00.000Z",
};

describe("playbooks page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.mocked(listPlaybooks).mockResolvedValue([
      playbook("pb-a", "Playbook A"),
      playbook("pb-b", "Playbook B"),
    ]);
    vi.mocked(getPlaybookConfiguration).mockResolvedValue({
      availableModelIds: ["claude-opus-5"],
      defaultModel: "claude-opus-5",
    });
    vi.mocked(reviewDocumentWithPlaybook).mockResolvedValue(RUN);
  });

  it("names the topic toggle and reports whether it is expanded", async () => {
    render(<PlaybooksPage />);

    const toggle = await screen.findByRole("button", {
      name: /collapse topic Liability/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);

    const collapsed = await screen.findByRole("button", {
      name: /expand topic Liability/i,
    });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show one playbook's review under another playbook", async () => {
    render(<PlaybooksPage />);

    // Run a review against Playbook A. The detail panel commits after the
    // sidebar, so wait for the action rather than the list entry.
    await userEvent.click(
      await screen.findByRole("button", { name: /Review document/i }),
    );
    await userEvent.upload(
      screen.getByLabelText(/^Contract$/i),
      new File(["A contract."], "contract.txt", { type: "text/plain" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Start review/i }));

    expect(await screen.findByText(RUN.summary as string)).toBeInTheDocument();

    // Switching playbooks must not carry Playbook A's findings across.
    await userEvent.click(screen.getByRole("button", { name: /Playbook B/i }));

    await waitFor(() => {
      expect(screen.queryByText(RUN.summary as string)).toBeNull();
    });
    expect(screen.queryByText(/Latest review/i)).toBeNull();
  });
});
