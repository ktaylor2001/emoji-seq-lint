#!/usr/bin/env node
import { createReadStream } from "node:fs";
import process from "node:process";
import type { Readable } from "node:stream";
import { lintStream } from "./linter.js";

async function main(): Promise<void> {
  const path = process.argv[2];
  const input: Readable = path ? createReadStream(path) : process.stdin;

  // Explicit setEncoding (rather than relying on default Buffer chunks)
  // ensures multi-byte UTF-8 sequences split across chunk boundaries are
  // reassembled correctly instead of being decoded chunk-by-chunk.
  input.setEncoding("utf8");

  const label = path ?? "<stdin>";
  let findingCount = 0;

  for await (const finding of lintStream(input)) {
    findingCount++;
    console.log(`${label}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`);
  }

  if (findingCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
});
