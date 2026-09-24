# emoji-seq-lint

A linter for malformed emoji sequences in text files. Reports the file,
line, and column of each problem it finds.

## Why

Emoji that render as a single glyph are often several codepoints under the
hood, joined with zero-width joiners (U+200D), paired as regional
indicators to form flags, or suffixed with a skin-tone modifier. Any of
those relationships can be broken by naive string handling: truncating a
string to a fixed byte length, splitting on UTF-16 code units instead of
codepoints, stripping "unknown" characters with an overly broad regex, or
hand-assembling a sequence from user input. The result is usually not a
crash, just a family emoji that silently degrades into a person emoji
followed by a stray joiner and a couple of boxes. This tool scans text for
that class of breakage.

It currently checks for:

- `dangling-zwj` — a zero-width joiner with no emoji before or after it
- `lone-regional-indicator` — a flag letter with no matching second letter
- `stray-skin-tone` — a skin-tone modifier not attached to an emoji base
- `stray-variation-selector` — a VS15/VS16 variation selector not attached
  to a symbol that has a text/emoji presentation to select between
- `stray-keycap` — a combining enclosing keycap (U+20E3) not attached to a
  keycap base (a digit, `#`, or `*`), as in the `1️⃣` sequence

## Usage

Build once:

```sh
npm run build
```

Lint a file:

```sh
node dist/cli.js chat-export.txt
```

Or pipe input in:

```sh
cat chat-export.txt | node dist/cli.js
```

Example input (`chat-export.txt`), where the family emoji on line 2 was cut
off mid-sequence by a byte-length truncation:

```
1: all good here 👍
2: 👨‍👩‍👧‍
3: not a flag: 🇺 hello
```

Output:

```
chat-export.txt:2:8: dangling-zwj: zero-width joiner is not followed by an emoji
chat-export.txt:3:14: lone-regional-indicator: regional indicator is not paired to form a flag sequence
```

The process exits with status 1 if any findings were reported, 0 otherwise,
so it can be used as a CI check.

### Fixing

`--fix` strips the offending codepoint for each finding — the dangling ZWJ,
the unpaired trailing regional indicator, the stray skin-tone modifier, the
stray variation selector — and writes the corrected text to stdout, line by
line, without ever buffering the whole file:

```sh
node dist/cli.js --fix chat-export.txt > chat-export.fixed.txt
```

Findings are still reported, on stderr, so they don't interleave with the
fixed text on stdout:

```
chat-export.txt:2:8: dangling-zwj: zero-width joiner is not followed by an emoji
```

The fix is a deletion, never a guess at what the sequence should have been;
a family emoji truncated mid-join loses its dangling joiner and nothing
else, it doesn't get the missing member invented for it.

## Tests

```sh
npm test
```

Runs `node --test` over the compiled output, using Node's built-in test
runner (no test framework dependency). `src/linter.test.ts` covers each
rule with one known-good sequence and one known-bad one, `--fix` stripping
the right codepoint for each rule, and a streaming test for each of
`lintStream` and `fixStream` that checks output lands on the right line
across a multi-line input.

## Streaming

Input is read one line at a time through `readline` over a stream (see
`lintStream` in `src/linter.ts`). A file is never read into memory in full;
at any point only the current line and its codepoints are held, so linting
a multi-gigabyte export costs the same memory as linting a one-line file.

## Known limitations

The emoji-codepoint ranges in `src/rules.ts` are a hand-picked subset of
the Unicode emoji blocks, not the full emoji-data.txt property table, so a
handful of legitimate emoji outside those ranges won't be recognized as
emoji.

A run of regional indicators is paired off two at a time, left to right,
the same way flag rendering does. An odd-length run (three, five, ...)
reports the trailing unpaired indicator as `lone-regional-indicator`,
since the ones before it did pair up into a real flag.

## License

MIT, see LICENSE.
