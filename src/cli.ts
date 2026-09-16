#!/usr/bin/env node
import { createReadStream } from "node:fs";
import process from "node:process";
import type { Readable } from "node:stream";
import { fixStream, lintStream } from "./linter.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const path = args.find((arg) => arg !== "--fix");
  const input: Readable = path ? createReadStream(path) : process.stdin;

  // Explicit setEncoding (rather than relying on default Buffer chunks)
  // ensures multi-byte UTF-8 sequences split across chunk boundaries are
  // reassembled correctly instead of being decoded chunk-by-chunk.
  input.setEncoding("utf8");

  const label = path ?? "<stdin>";
  let findingCount = 0;

  if (fix) {
    // Fixed text is the program's output, so it goes to stdout; findings
    // go to stderr instead of interleaving with it, the same split `sed`
    // and similar in-place filters use.
    for await (const fixed of fixStream(input)) {
      findingCount += fixed.findings.length;
      for (const finding of fixed.findings) {
        console.error(`${label}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
      }
      process.stdout.write(fixed.text + "\n");
    }
  } else {
    for await (const finding of lintStream(input)) {
      findingCount++;
      console.log(`${label}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
    }
  }

  if (findingCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
});
