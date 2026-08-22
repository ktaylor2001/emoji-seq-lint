import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import {
  ZWJ,
  VS16_EMOJI,
  isEmojiCodepoint,
  isRegionalIndicator,
  isSkinToneModifier,
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

export function lintLine(text: string, lineNumber: number): Finding[] {
  const codepoints = toCodepoints(text);
  const findings: Finding[] = [];

  for (let i = 0; i < codepoints.length; i++) {
    const cp = codepoints[i];
    const prev = i > 0 ? codepoints[i - 1] : undefined;
    const next = i + 1 < codepoints.length ? codepoints[i + 1] : undefined;

    if (cp === ZWJ) {
      if (prev === undefined || !isEmojiCodepoint(prev)) {
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

    if (isRegionalIndicator(cp)) {
      const pairedWithNext = next !== undefined && isRegionalIndicator(next);
      const pairedWithPrev = prev !== undefined && isRegionalIndicator(prev);
      if (!pairedWithNext && !pairedWithPrev) {
        findings.push({
          line: lineNumber,
          column: i + 1,
          rule: "lone-regional-indicator",
          message: "regional indicator is not paired to form a flag sequence",
        });
      }
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
