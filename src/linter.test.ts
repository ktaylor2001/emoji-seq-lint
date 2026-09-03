import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { lintLine, lintStream } from "./linter.js";

// Grouping notes: each rule gets one known-good sequence (should produce no
// findings) and at least one known-bad sequence (should produce exactly the
// finding the rule is named for, at the expected column). Columns are
// 1-indexed codepoints, matching what lintLine reports.

test("plain text and a single emoji produce no findings", () => {
  assert.deepEqual(lintLine("all good here \u{1F44D}", 1), []);
});

test("a fully joined ZWJ sequence produces no findings", () => {
  // family: man ZWJ woman ZWJ girl ZWJ boy
  const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
  assert.deepEqual(lintLine(family, 1), []);
});

test("a paired regional indicator flag produces no findings", () => {
  const flag = "\u{1F1FA}\u{1F1F8}"; // regional indicators U + S
  assert.deepEqual(lintLine(flag, 1), []);
});

test("an emoji with a skin tone modifier produces no findings", () => {
  const thumbsUpMedium = "\u{1F44D}\u{1F3FD}";
  assert.deepEqual(lintLine(thumbsUpMedium, 1), []);
});

test("a symbol with a text variation selector produces no findings", () => {
  const textSmiley = "☺︎";
  assert.deepEqual(lintLine(textSmiley, 1), []);
});

test("a variation-selector base followed by ZWJ and another emoji produces no findings", () => {
  // rainbow flag: white flag, VS16, ZWJ, rainbow. The ZWJ's real
  // predecessor is the flag, one codepoint behind the variation selector.
  const rainbowFlag = "\u{1F3F3}️‍\u{1F308}";
  assert.deepEqual(lintLine(rainbowFlag, 1), []);
});

test("dangling-zwj: ZWJ not preceded by an emoji", () => {
  const findings = lintLine("a‍", 3);
  assert.deepEqual(findings, [
    {
      line: 3,
      column: 2,
      rule: "dangling-zwj",
      message: "zero-width joiner is not preceded by an emoji",
    },
  ]);
});

test("dangling-zwj: ZWJ not followed by an emoji", () => {
  const findings = lintLine("\u{1F44D}‍", 4);
  assert.deepEqual(findings, [
    {
      line: 4,
      column: 2,
      rule: "dangling-zwj",
      message: "zero-width joiner is not followed by an emoji",
    },
  ]);
});

test("lone-regional-indicator: a single unpaired indicator", () => {
  const findings = lintLine("\u{1F1FA}", 5);
  assert.deepEqual(findings, [
    {
      line: 5,
      column: 1,
      rule: "lone-regional-indicator",
      message: "regional indicator is not paired to form a flag sequence",
    },
  ]);
});

test("lone-regional-indicator: an odd-length run leaves the trailing one dangling", () => {
  const run = "\u{1F1FA}\u{1F1F8}\u{1F1EC}"; // U, S, G
  const findings = lintLine(run, 6);
  assert.deepEqual(findings, [
    {
      line: 6,
      column: 3,
      rule: "lone-regional-indicator",
      message: "regional indicator is not paired to form a flag sequence",
    },
  ]);
});

test("stray-skin-tone: modifier not attached to an emoji base", () => {
  const findings = lintLine("a\u{1F3FD}", 7);
  assert.deepEqual(findings, [
    {
      line: 7,
      column: 2,
      rule: "stray-skin-tone",
      message: "skin tone modifier does not follow an emoji base",
    },
  ]);
});

test("stray-variation-selector: emoji selector not attached to a symbol", () => {
  const findings = lintLine("a️", 8);
  assert.deepEqual(findings, [
    {
      line: 8,
      column: 2,
      rule: "stray-variation-selector",
      message: "emoji variation selector does not follow a symbol that supports it",
    },
  ]);
});

test("stray-variation-selector: text selector not attached to a symbol", () => {
  const findings = lintLine("a︎", 9);
  assert.deepEqual(findings, [
    {
      line: 9,
      column: 2,
      rule: "stray-variation-selector",
      message: "text variation selector does not follow a symbol that supports it",
    },
  ]);
});

test("lintStream reports the correct line number for each finding across multiple lines", async () => {
  const input = Readable.from([
    "all good here \u{1F44D}\n",
    "\u{1F468}‍\u{1F469}‍\u{1F467}‍\n", // family cut off mid-sequence
    "not a flag: \u{1F1FA} hello\n",
  ]);

  const findings = [];
  for await (const finding of lintStream(input)) {
    findings.push(finding);
  }

  assert.deepEqual(
    findings.map((f) => [f.line, f.rule]),
    [
      [2, "dangling-zwj"],
      [3, "lone-regional-indicator"],
    ],
  );
});
