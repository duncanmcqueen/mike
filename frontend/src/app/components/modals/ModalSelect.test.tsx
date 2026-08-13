import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalSelect } from "./ModalSelect";

describe("ModalSelect", () => {
    it("filters searchable options by label or value and selects a result", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <ModalSelect
                id="monitor-model"
                value=""
                searchable
                searchPlaceholder="Search models..."
                options={[
                    {
                        value: "openrouter/anthropic/claude-sonnet-4",
                        label: "OpenRouter · Claude Sonnet 4",
                    },
                    { value: "gpt-5.4", label: "OpenAI · GPT-5.4" },
                ]}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Select..." }));
        await user.type(
            screen.getByRole("textbox", { name: "Search models..." }),
            "anthropic/claude",
        );

        expect(
            screen.getByRole("option", {
                name: "OpenRouter · Claude Sonnet 4",
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("option", { name: "OpenAI · GPT-5.4" }),
        ).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("option", {
                name: "OpenRouter · Claude Sonnet 4",
            }),
        );
        expect(onChange).toHaveBeenCalledWith(
            "openrouter/anthropic/claude-sonnet-4",
        );
        expect(
            screen.queryByRole("textbox", { name: "Search models..." }),
        ).not.toBeInTheDocument();
    });
});
