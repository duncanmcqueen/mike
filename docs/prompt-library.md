# Prompt Library

MikeOSS includes a Prompt Library for reusable legal prompts. Open **Prompts** from the application sidebar to browse built-in prompts, create personal prompts, search prompt text and metadata, or filter by category.

## Built-in prompts

The built-in library contains all 108 rows from `mike-EXAMPLE-2026-07-29T18_14_42.184341.xlsx`:

- 39 Analyze assignments
- 35 Draft assignments
- 34 Summarize assignments
- 12 Compare assignments
- 8 Ideate assignments
- 3 Translate assignments

Some prompts have more than one category. The workbook contains 106 unique query bodies and two exact duplicate records; all 108 records are preserved with stable IDs. Names, queries, prompt types, categories, practice areas, source requirements, original creators, and original timestamps are retained.

The workbook's example responses are not injected into a new model request. They are historical outputs rather than reusable instructions, and using them would risk anchoring a new response to stale facts or unsupported citations.

Built-in prompts are versioned with MikeOSS and cannot be edited or deleted. Select **Use prompt** to open Assistant with the prompt loaded into the composer.

## Personal prompts

Select **New** on the Prompt Library page and provide:

- A name and prompt body.
- An optional description and prompt type.
- Comma-separated categories, practice areas, and source requirements.

Personal prompts are stored in SQLite under the current user ID. They can be edited or deleted from the detail view and are included in account export and account deletion.

## Run a prompt

There are two ways to select a prompt:

1. Open **Prompts**, choose a prompt, and select **Use prompt**.
2. Open Assistant and select the **Prompts** book icon in the composer.

Selecting a prompt fills the composer but does not submit it automatically. This gives the user an opportunity to add matter-specific instructions, choose a model or committee, and attach documents when the prompt is marked as requiring files.

## Storage and API

Custom prompts use the `saved_prompts` SQLite table. Built-ins are loaded from `backend/src/data/mikeExamplePrompts.json` and returned alongside the current user's rows.

Authenticated endpoints:

- `GET /prompts`
- `GET /prompts/:promptId`
- `POST /prompts`
- `PUT /prompts/:promptId`
- `DELETE /prompts/:promptId`

Write operations require the same MFA verification policy used by other sensitive account changes.
