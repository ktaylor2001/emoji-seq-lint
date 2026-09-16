import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import {
  ZWJ,
  VS16_EMOJI,
  isEmojiCodepoint,
  isRegionalIndicator,
  isSkinToneModifier,
  isVariationSelector,
} from "./rules.js";

export interface Finding {
  line: number;
  column: number;
  rule: string;
  message: string;
}

// Split on codepoints rather than UTF-16 code units so surrogate pairs
// (most emoji live above U+FFFF) count as one character each, and columns
// line up with what a person sees rather than with UTF-16 storage.
function toCodepoints(text: string): number[] {
  return Array.from(text, (ch) => ch.codePointAt(0) ?? 0);
}

// A variation selector attaches to the base immediately before it, so a
// sequence like "base VS16 ZWJ base2" (e.g. the rainbow flag) has the ZWJ's
// real predecessor one codepoint further back than usual. Looking through a
// single selector here keeps that pattern from being misread as a dangling
// join.
function baseBefore(codepoints: number[], index: number): number | undefined {
  if (index <= 0) return undefined;
  const cp = codepoints[index - 1];
  if (isVariationSelector(cp) && index - 1 > 0) {
    return codepoints[index - 2];
  }
  return cp;
}

export function lintLine(text: string, lineNumber: number): Finding[] {
  const codepoints = toCodepoints(text);
  const findings: Finding[] = [];

  for (let i = 0; i < codepoints.length; i++) {
    const cp = codepoints[i];
    const prev = i > 0 ? codepoints[i - 1] : undefined;
    const next = i + 1 < codepoints.length ? codepoints[i + 1] : undefined;

    if (cp === ZWJ) {
      const prevBase = baseBefore(codepoints, i);
      if (prevBase === undefined || !isEmojiCodepoint(prevBase)) {
        findings.push({
          line: lineNumber,
          column: i + 1,
          rule: "dangling-zwj",
          message: "zero-width joiner is not preceded by an emoji",
        });
      } else if (next === undefined || !(isEmojiCodepoint(next) || next === VS16_EMOJI)) {
        findings.push({
          line: lineNumber,
          column: i + 1,
          rule: "dangling-zwj",
          message: "zero-width joiner is not followed by an emoji",
        });
      }
    }

    // Flags are formed by pairing regional indicators two at a time, left
    // to right, within an unbroken run. A run of three pairs the first two
    // into a flag and leaves the third dangling; a run of five leaves the
    // fifth dangling; even-length runs pair off completely. Checking each
    // indicator only against its immediate neighbor (as opposed to the
    // whole run) would wrongly clear every indicator in an odd run, since
    // each one but the last has a same-run neighbor on one side or the
    // other.
    if (isRegionalIndicator(cp) && (prev === undefined || !isRegionalIndicator(prev))) {
      let runEnd = i;
      while (runEnd + 1 < codepoints.length && isRegionalIndicator(codepoints[runEnd + 1])) {
        runEnd++;
      }
      const runLength = runEnd - i + 1;
      if (runLength % 2 === 1) {
        findings.push({
          line: lineNumber,
          column: runEnd + 1,
          rule: "lone-regional-indicator",
          message: "regional indicator is not paired to form a flag sequence",
        });
      }
      i = runEnd;
    }

    if (isSkinToneModifier(cp)) {
      if (prev === undefined || !isEmojiCodepoint(prev)) {
        findings.push({
          line: lineNumber,
          column: i + 1,
          rule: "stray-skin-tone",
          message: "skin tone modifier does not follow an emoji base",
        });
      }
    }

    if (isVariationSelector(cp)) {
      if (prev === undefined || !isEmojiCodepoint(prev)) {
        findings.push({
          line: lineNumber,
          column: i + 1,
          rule: "stray-variation-selector",
          message:
            cp === VS16_EMOJI
              ? "emoji variation selector does not follow a symbol that supports it"
              : "text variation selector does not follow a symbol that supports it",
        });
      }
    }
  }

  return findings;
}

// Reads the input one line at a time via readline over the given stream, so
// a multi-gigabyte file is checked with only a single line held in memory
// at any point, rather than being read in full before linting starts.
export async function* lintStream(input: Readable): AsyncGenerator<Finding> {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    for (const finding of lintLine(line, lineNumber)) {
      yield finding;
    }
  }
}

export interface FixedLine {
  text: string;
  findings: Finding[];
}

// Every rule's reported column is the offending codepoint's own position,
// not a neighbor's: the ZWJ itself for dangling-zwj, the trailing indicator
// of an odd run for lone-regional-indicator, the modifier for
// stray-skin-tone, the selector for stray-variation-selector. That makes
// the fix uniform across rules: drop the codepoint at each finding's
// column and leave everything else untouched.
export function fixLine(text: string, lineNumber: number): FixedLine {
  const findings = lintLine(text, lineNumber);
  if (findings.length === 0) {
    return { text, findings };
  }
  const removeAt = new Set(findings.map((f) => f.column - 1));
  const kept = toCodepoints(text).filter((_, i) => !removeAt.has(i));
  return { text: String.fromCodePoint(...kept), findings };
}

// Streams fixes the same way lintStream streams findings: one line of the
// input, and one line of state, at a time. The trailing newline of the
// original file (present or not) isn't tracked, since readline strips line
// endings before a line ever reaches here; callers write fixed lines back
// with a single "\n" each.
export async function* fixStream(input: Readable): AsyncGenerator<FixedLine> {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    yield fixLine(line, lineNumber);
  }
}
