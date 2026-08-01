/* global Word */

/**
 * Office.js helpers for inserting Word comments and applying tracked edits.
 *
 * Comments are anchored to a range via `Range.insertComment(text)`. This
 * requires WordApi 1.4+, which is already declared in our manifest's
 * minimum requirement set, so callers don't need to feature-detect.
 *
 * All errors are logged + re-thrown so the caller can surface them.
 *
 * Reference:
 *   https://learn.microsoft.com/en-us/javascript/api/word/word.range
 *   #word-word-range-insertcomment-member(1)
 */

import { applyEditsWithTracking, type EditProposal } from "../hooks/useWordDoc";

export type EditMode = "track" | "comments";

/**
 * Insert a comment anchored to whatever the user currently has selected.
 * If the selection is empty (just a caret), Word still anchors the comment
 * at that point.
 */
export async function insertCommentAtCurrentSelection(
  text: string,
): Promise<void> {
  try {
    await Word.run(async (context) => {
      const sel = context.document.getSelection();
      sel.insertComment(text);
      await context.sync();
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[wordComments] insertCommentAtCurrentSelection failed", err);
    throw err;
  }
}

// Word's body.search() has a hard 255-character query limit AND won't match
// across paragraph marks (^p). LLM-produced `find` text frequently spans a
// heading + its first paragraph — perfectly natural to a human, fatal to
// body.search. We pick the most-distinctive short fragment of the query
// that DOESN'T contain a line break and use that as the anchor, then expand
// to a matching tail anchor when one is available.
const SEARCH_LIMIT = 200;
const ANCHOR_CHARS = 80;

/**
 * Split `find` into paragraph-sized chunks and return non-empty ones in
 * document order. Used to pick search anchors that don't cross Word's
 * paragraph marks (the most common reason a multi-line `find` returns 0
 * hits).
 */
function splitParagraphs(find: string): string[] {
  return find
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * Locate a Range in the document body matching `fullFind`. Tries strategies
 * in order of fidelity:
 *
 *   1. Direct search on the trimmed find (when ≤ search limit AND no
 *      paragraph break inside).
 *   2. Head-only search using the longest line of the find (≤ 80 chars).
 *   3. Head+tail anchors using the first and last lines, joined with
 *      Range.expandTo so the returned range spans the full clause.
 *
 * Returns null when nothing matches.
 */
async function locateRange(
  context: Word.RequestContext,
  fullFind: string,
): Promise<Word.Range | null> {
  const body = context.document.body;
  const trimmed = fullFind.trim();
  if (!trimmed) return null;

  const findOne = async (q: string): Promise<Word.Range | null> => {
    if (!q || q.length < 4) return null;
    const r = body.search(q, { matchCase: false, matchWholeWord: false });
    r.load("items");
    await context.sync();
    return r.items[0] ?? null;
  };

  // Strategy 1: direct match. Only viable when the find is single-paragraph
  // and under Word's search limit. Skip otherwise (paragraph marks always
  // sink the query).
  const hasLineBreak = /[\r\n]/.test(trimmed);
  if (!hasLineBreak && trimmed.length <= SEARCH_LIMIT) {
    const direct = await findOne(trimmed);
    if (direct) return direct;
  }

  // Strategy 2 + 3: split on paragraph marks and use the chunks as anchors.
  const paragraphs = splitParagraphs(trimmed);
  if (paragraphs.length === 0) return null;

  const headSrc = paragraphs[0];
  const tailSrc = paragraphs[paragraphs.length - 1];
  const head = clip(headSrc, ANCHOR_CHARS);
  const tail = clip(tailSrc, ANCHOR_CHARS);

  // Single-paragraph fallback (no break): just head, possibly clipped.
  if (paragraphs.length === 1) {
    return findOne(head);
  }

  // Multi-paragraph: anchor head + tail and expand the range.
  const headRange = await findOne(head);
  if (!headRange) return null;
  const tailRange = await findOne(tail);
  if (!tailRange) {
    // Couldn't anchor the tail — partial coverage on the head paragraph
    // is still better than failing the whole edit.
    return headRange;
  }
  try {
    return headRange.expandTo(tailRange);
  } catch {
    return headRange;
  }
}

/**
 * Find `searchString` in the document body and attach `commentText` as a
 * comment anchored to the first match. Throws if no match is found so the
 * caller can fall back / surface a "not found" toast.
 */
export async function insertCommentAtRange(
  searchString: string,
  commentText: string,
): Promise<void> {
  try {
    await Word.run(async (context) => {
      const range = await locateRange(context, searchString);
      if (!range) {
        throw new Error(
          `Could not find anchor text in document: "${
            searchString.length > 60
              ? searchString.slice(0, 60) + "…"
              : searchString
          }"`,
        );
      }
      range.insertComment(commentText);
      await context.sync();
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[wordComments] insertCommentAtRange failed", err);
    throw err;
  }
}

/**
 * Wraps the existing tracked-changes flow for parity with the comments path.
 * Delegates to `applyEditsWithTracking` from useWordDoc.
 */
export async function applyTrackedEdit(
  originalText: string,
  newText: string,
): Promise<void> {
  try {
    const edits: EditProposal[] = [{ find: originalText, replace: newText }];
    const { applied, notFound } = await applyEditsWithTracking(edits);
    if (applied === 0 && notFound.length > 0) {
      throw new Error(
        `Could not find text to replace: "${
          originalText.length > 60
            ? originalText.slice(0, 60) + "…"
            : originalText
        }"`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[wordComments] applyTrackedEdit failed", err);
    throw err;
  }
}

/**
 * Explainable Track Change: replace `edit.find` with `edit.replace` while
 * track changes is enabled, AND attach a Word comment with `edit.reason`
 * (when present) anchored to the inserted range. This gives reviewers both
 * the redline and the rationale in one place.
 *
 * Office.js calls used: `body.search(...)` to locate the original text,
 * `range.insertText(replace, "Replace")` to perform the tracked replacement,
 * and `range.insertComment(reason)` to anchor the rationale on the new
 * range — all inside a single `Word.run` with `changeTrackingMode = trackAll`.
 */
export async function applyTrackedChangeWithComment(edit: {
  find: string;
  replace: string;
  reason?: string;
}): Promise<{ applied: number; notFound: number }> {
  try {
    return await Word.run(async (context) => {
      context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

      const target = await locateRange(context, edit.find);
      if (!target) {
        return { applied: 0, notFound: 1 };
      }

      // Two-step pattern for reliable track-changes on Word for Mac:
      //   1) Insert the replacement BEFORE the existing range (tracked as
      //      an insertion).
      //   2) Delete the original range (tracked as a deletion).
      // The single-step `insertText(text, "Replace")` form sometimes loses
      // the insertion half on macOS, leaving the user with a tracked delete
      // but no replacement — which is exactly the bug we're fixing.
      const inserted = target.insertText(
        edit.replace,
        Word.InsertLocation.before,
      );
      target.delete();

      const reason = (edit.reason ?? "").trim();
      if (reason) {
        inserted.insertComment(`Mike: ${reason}`);
      }

      await context.sync();
      return { applied: 1, notFound: 0 };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[wordComments] applyTrackedChangeWithComment failed", err);
    throw err;
  }
}

/**
 * Apply a batch of EditProposals as Word comments. For each proposal we
 * search for `find` and anchor a comment containing the suggested
 * replacement (and optional reason) on the first match. Returns counts so
 * the UI can display "N applied · M not found".
 */
export async function applyEditsAsComments(
  edits: EditProposal[],
): Promise<{ applied: number; notFound: string[] }> {
  let applied = 0;
  const notFound: string[] = [];

  for (const edit of edits) {
    try {
      const body = edit.reason
        ? `Mike: ${edit.replace}\n\n(${edit.reason})`
        : `Mike: ${edit.replace}`;
      await insertCommentAtRange(edit.find, body);
      applied += 1;
    } catch {
      notFound.push(edit.find);
    }
  }

  return { applied, notFound };
}
