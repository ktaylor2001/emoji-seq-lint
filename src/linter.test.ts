import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { fixLine, fixStream, lintLine, lintStream } from "./linter.js";

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

test("a fully-qualified keycap sequence produces no findings", () => {
  // digit one, VS16, combining enclosing keycap: 1️⃣
  const keycapOne = "1\u{fe0f}\u{20e3}";
  assert.deepEqual(lintLine(keycapOne, 1), []);
});

test("a minimally-qualified keycap sequence (no VS16) produces no findings", () => {
  const keycapHash = "#\u{20e3}";
  assert.deepEqual(lintLine(keycapHash, 1), []);
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

test("stray-keycap: combining enclosing keycap not attached to a keycap base", () => {
  const findings = lintLine("a\u{20e3}", 10);
  assert.deepEqual(findings, [
    {
      line: 10,
      column: 2,
      rule: "stray-keycap",
      message: "combining enclosing keycap does not follow a keycap base (digit, #, or *)",
    },
  ]);
});

test("fixLine leaves a clean line untouched", () => {
  const result = fixLine("all good here \u{1F44D}", 1);
  assert.deepEqual(result, { text: "all good here \u{1F44D}", findings: [] });
});

test("fixLine strips a dangling ZWJ and reports why", () => {
  const result = fixLine("\u{1F44D}‍", 4);
  assert.equal(result.text, "\u{1F44D}");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, "dangling-zwj");
});

test("fixLine strips only the trailing indicator of an odd run", () => {
  const run = "\u{1F1FA}\u{1F1F8}\u{1F1EC}"; // U, S, G
  const result = fixLine(run, 6);
  assert.equal(result.text, "\u{1F1FA}\u{1F1F8}"); // the paired flag survives
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, "lone-regional-indicator");
});

test("fixLine strips a stray skin tone modifier", () => {
  const result = fixLine("a\u{1F3FD}", 7);
  assert.equal(result.text, "a");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, "stray-skin-tone");
});

test("fixLine strips a stray variation selector", () => {
  const result = fixLine("a️", 8);
  assert.equal(result.text, "a");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, "stray-variation-selector");
});

test("fixLine strips a stray keycap", () => {
  const result = fixLine("a\u{20e3}", 10);
  assert.equal(result.text, "a");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, "stray-keycap");
});

test("fixLine can strip multiple unrelated problems from one line", () => {
  const result = fixLine("a‍ b\u{1F3FD}", 9);
  assert.equal(result.text, "a b");
  assert.equal(result.findings.length, 2);
});

test("fixStream fixes each line independently and reports findings per line", async () => {
  const input = Readable.from([
    "all good here \u{1F44D}\n",
    "\u{1F468}‍\u{1F469}‍\u{1F467}‍\n", // family cut off mid-sequence
    "not a flag: \u{1F1FA} hello\n",
  ]);

  const fixed = [];
  for await (const line of fixStream(input)) {
    fixed.push(line);
  }

  assert.deepEqual(
    fixed.map((f) => f.text),
    [
      "all good here \u{1F44D}",
      "\u{1F468}‍\u{1F469}‍\u{1F467}",
      "not a flag:  hello",
    ],
  );
  assert.deepEqual(
    fixed.map((f) => f.findings.map((finding) => finding.rule)),
    [[], ["dangling-zwj"], ["lone-regional-indicator"]],
  );
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
