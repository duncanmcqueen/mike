/* global Word, Office */

// ---------------------------------------------------------------------------
// Formatting options
// ---------------------------------------------------------------------------

export interface FormatOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  allCaps?: boolean;
  fontSize?: number;
  fontName?: string;
  fontColor?: string;
  highlightColor?: string;
}

export interface SelectionFormatting {
  bold: boolean | null;
  italic: boolean | null;
  underline: boolean | null;
  strikethrough: boolean | null;
  fontSize: number | null;
  fontName: string | null;
  fontColor: string | null;
  isEmpty: boolean;
}

export type TrackChangesMode = "off" | "all" | "mine";
export type ParagraphAlignment = "left" | "center" | "right" | "justify";

// ---------------------------------------------------------------------------
// Document content
// ---------------------------------------------------------------------------

export async function getDocumentText(): Promise<string> {
  return Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return body.text ?? "";
  });
}

export async function getSelectionText(): Promise<{
  text: string;
  isEmpty: boolean;
}> {
  return Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.load("text,isEmpty");
    await context.sync();
    return { text: sel.text ?? "", isEmpty: sel.isEmpty };
  });
}

// ---------------------------------------------------------------------------
// Rich selection state — used by the composer to display a "Selection: …"
// chip and to scope agent edits to just the highlighted range.
// ---------------------------------------------------------------------------

export type WordSelectionState = {
  text: string;
  isEmpty: boolean;
  length: number;
  /** First 50 chars of the selection, with an ellipsis if truncated. */
  snippet: string;
};

const EMPTY_SELECTION: WordSelectionState = {
  text: "",
  isEmpty: true,
  length: 0,
  snippet: "",
};

function buildSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  if (collapsed.length <= 50) return collapsed;
  return collapsed.slice(0, 50) + "…";
}

export async function getSelectionState(): Promise<WordSelectionState> {
  try {
    if (typeof Word === "undefined") return EMPTY_SELECTION;
    return await Word.run(async (context) => {
      const sel = context.document.getSelection();
      sel.load("text,isEmpty");
      await context.sync();
      const text = sel.text ?? "";
      const isEmpty = sel.isEmpty || text.length === 0;
      if (isEmpty) return EMPTY_SELECTION;
      return {
        text,
        isEmpty: false,
        length: text.length,
        snippet: buildSnippet(text),
      };
    });
  } catch {
    return EMPTY_SELECTION;
  }
}

// ---------------------------------------------------------------------------
// Text editing
// ---------------------------------------------------------------------------

export async function insertTextAtCursor(text: string): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.insertText(text, Word.InsertLocation.replace);
    await context.sync();
  });
}

export async function deleteSelection(): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.delete();
    await context.sync();
  });
}

export async function insertParagraph(text: string): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.insertParagraph(text, Word.InsertLocation.after);
    await context.sync();
  });
}

// ---------------------------------------------------------------------------
// Font formatting
// ---------------------------------------------------------------------------

export async function applyFormatting(opts: FormatOptions): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();

    if (opts.bold !== undefined) sel.font.bold = opts.bold;
    if (opts.italic !== undefined) sel.font.italic = opts.italic;
    if (opts.strikethrough !== undefined)
      sel.font.strikeThrough = opts.strikethrough;
    if (opts.superscript !== undefined) sel.font.superscript = opts.superscript;
    if (opts.subscript !== undefined) sel.font.subscript = opts.subscript;
    if (opts.allCaps !== undefined) sel.font.allCaps = opts.allCaps;
    if (opts.fontSize !== undefined) sel.font.size = opts.fontSize;
    if (opts.fontName !== undefined) sel.font.name = opts.fontName;
    if (opts.fontColor !== undefined) sel.font.color = opts.fontColor;
    if (opts.highlightColor !== undefined)
      sel.font.highlightColor = opts.highlightColor;

    if (opts.underline !== undefined) {
      sel.font.underline = opts.underline
        ? Word.UnderlineType.single
        : Word.UnderlineType.none;
    }

    await context.sync();
  });
}

export async function toggleBold(): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.font.load("bold");
    await context.sync();
    sel.font.bold = !sel.font.bold;
    await context.sync();
  });
}

export async function toggleItalic(): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.font.load("italic");
    await context.sync();
    sel.font.italic = !sel.font.italic;
    await context.sync();
  });
}

export async function toggleUnderline(): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.font.load("underline");
    await context.sync();
    sel.font.underline =
      sel.font.underline === Word.UnderlineType.none
        ? Word.UnderlineType.single
        : Word.UnderlineType.none;
    await context.sync();
  });
}

export async function getSelectionFormatting(): Promise<SelectionFormatting> {
  return Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.font.load("bold,italic,underline,strikeThrough,size,name,color");
    sel.load("isEmpty");
    await context.sync();

    return {
      bold: sel.font.bold,
      italic: sel.font.italic,
      underline: sel.font.underline !== Word.UnderlineType.none,
      strikethrough: sel.font.strikeThrough,
      fontSize: sel.font.size,
      fontName: sel.font.name,
      fontColor: sel.font.color,
      isEmpty: sel.isEmpty,
    };
  });
}

// ---------------------------------------------------------------------------
// Paragraph formatting
// ---------------------------------------------------------------------------

export async function alignParagraph(
  alignment: ParagraphAlignment,
): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.paragraphs.load("items");
    await context.sync();

    const map: Record<ParagraphAlignment, Word.Alignment> = {
      left: Word.Alignment.left,
      center: Word.Alignment.centered,
      right: Word.Alignment.right,
      justify: Word.Alignment.justified,
    };

    for (const para of sel.paragraphs.items) {
      para.alignment = map[alignment];
    }
    await context.sync();
  });
}

export async function setParagraphStyle(styleName: string): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.paragraphs.load("items");
    await context.sync();
    for (const para of sel.paragraphs.items) {
      para.styleBuiltIn = styleName as Word.BuiltInStyleName;
    }
    await context.sync();
  });
}

export async function setLineSpacing(spacing: number): Promise<void> {
  await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.paragraphs.load("items");
    await context.sync();
    for (const para of sel.paragraphs.items) {
      para.lineSpacing = spacing;
    }
    await context.sync();
  });
}

// ---------------------------------------------------------------------------
// Track changes
// ---------------------------------------------------------------------------

export async function setTrackChangesMode(
  mode: TrackChangesMode,
): Promise<void> {
  await Word.run(async (context) => {
    const modeMap: Record<TrackChangesMode, Word.ChangeTrackingMode> = {
      off: Word.ChangeTrackingMode.off,
      all: Word.ChangeTrackingMode.trackAll,
      mine: Word.ChangeTrackingMode.trackMineOnly,
    };
    context.document.changeTrackingMode = modeMap[mode];
    await context.sync();
  });
}

export async function getTrackChangesMode(): Promise<TrackChangesMode> {
  return Word.run(async (context) => {
    context.document.load("changeTrackingMode");
    await context.sync();
    const m = context.document.changeTrackingMode;
    if (m === Word.ChangeTrackingMode.trackAll) return "all";
    if (m === Word.ChangeTrackingMode.trackMineOnly) return "mine";
    return "off";
  });
}

export async function acceptAllChanges(): Promise<{
  ok: boolean;
  count: number;
  fallback?: boolean;
}> {
  try {
    return await Word.run(async (context) => {
      const revisions = context.document.revisions;
      revisions.load("items");
      await context.sync();
      const count = revisions.items.length;
      revisions.items.forEach((r) => r.accept());
      await context.sync();
      return { ok: true, count };
    });
  } catch {
    // Revisions API unavailable in this Word version
    return { ok: false, count: 0, fallback: true };
  }
}

export async function rejectAllChanges(): Promise<{
  ok: boolean;
  count: number;
  fallback?: boolean;
}> {
  try {
    return await Word.run(async (context) => {
      const revisions = context.document.revisions;
      revisions.load("items");
      await context.sync();
      const count = revisions.items.length;
      // Reject in reverse order to preserve positions
      [...revisions.items].reverse().forEach((r) => r.reject());
      await context.sync();
      return { ok: true, count };
    });
  } catch {
    return { ok: false, count: 0, fallback: true };
  }
}

export async function getRevisionCount(): Promise<number | null> {
  try {
    return await Word.run(async (context) => {
      const revisions = context.document.revisions;
      revisions.load("items");
      await context.sync();
      return revisions.items.length;
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Find & replace (with optional track changes)
// ---------------------------------------------------------------------------

export interface EditProposal {
  find: string;
  replace: string;
  reason?: string;
}

export async function applyEditsWithTracking(
  edits: EditProposal[],
): Promise<{ applied: number; notFound: string[] }> {
  let applied = 0;
  const notFound: string[] = [];

  // Word's body.search() caps at 255 chars and — crucially — won't match
  // across paragraph marks. So LLM `find` strings that span a heading +
  // its first paragraph come back empty even though the text is right
  // there. We split on line breaks and anchor on whichever paragraph
  // chunks survive Word's search rules. Mirrors the helper in
  // lib/wordComments.ts (kept inline so this hook stays standalone).
  const ANCHOR_CHARS = 80;
  const SEARCH_LIMIT = 200;

  const splitParagraphs = (s: string) =>
    s
      .split(/[\r\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 6);
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

  async function findOne(
    context: Word.RequestContext,
    q: string,
  ): Promise<Word.Range | null> {
    if (!q || q.length < 4) return null;
    const r = context.document.body.search(q, {
      matchCase: false,
      matchWholeWord: false,
    });
    r.load("items");
    await context.sync();
    return r.items[0] ?? null;
  }

  for (const edit of edits) {
    try {
      const count = await Word.run(async (context) => {
        context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

        const find = (edit.find ?? "").trim();
        if (!find) return 0;

        // Strategy 1: direct search when the find fits on one paragraph.
        const hasLineBreak = /[\r\n]/.test(find);
        if (!hasLineBreak && find.length <= SEARCH_LIMIT) {
          const direct = await findOne(context, find);
          if (direct) {
            direct.insertText(edit.replace, Word.InsertLocation.before);
            direct.delete();
            await context.sync();
            return 1;
          }
        }

        // Strategy 2/3: split on paragraph marks, anchor on head (+ tail).
        const paragraphs = splitParagraphs(find);
        if (paragraphs.length === 0) return 0;
        const head = clip(paragraphs[0], ANCHOR_CHARS);
        const tail = clip(
          paragraphs[paragraphs.length - 1],
          ANCHOR_CHARS,
        );

        const headRange = await findOne(context, head);
        if (!headRange) return 0;

        let target: Word.Range = headRange;
        if (paragraphs.length > 1) {
          const tailRange = await findOne(context, tail);
          if (tailRange) {
            try {
              target = headRange.expandTo(tailRange);
            } catch {
              target = headRange;
            }
          }
        }

        target.insertText(edit.replace, Word.InsertLocation.before);
        target.delete();
        await context.sync();
        return 1;
      });

      if (count === 0) notFound.push(edit.find);
      else applied += count;
    } catch {
      notFound.push(edit.find);
    }
  }

  return { applied, notFound };
}

export async function findAndReplace(
  find: string,
  replace: string,
  options?: { matchCase?: boolean; matchWholeWord?: boolean },
): Promise<number> {
  return Word.run(async (context) => {
    const ranges = context.document.body.search(find, {
      matchCase: options?.matchCase ?? false,
      matchWholeWord: options?.matchWholeWord ?? false,
    });
    ranges.load("items");
    await context.sync();

    for (const range of ranges.items) {
      range.insertText(replace, Word.InsertLocation.replace);
    }
    await context.sync();
    return ranges.items.length;
  });
}

// ---------------------------------------------------------------------------
// Document content for chat context
// ---------------------------------------------------------------------------

export async function getDocumentForContext(
  maxChars = 40000,
): Promise<string> {
  return Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    const text = body.text ?? "";
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + "\n[…document truncated for context…]";
  });
}
