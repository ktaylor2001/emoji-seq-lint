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

## Streaming

Input is read one line at a time through `readline` over a stream (see
`lintStream` in `src/linter.ts`). A file is never read into memory in full;
at any point only the current line and its codepoints are held, so linting
a multi-gigabyte export costs the same memory as linting a one-line file.

## Known limitations

The emoji-codepoint ranges in `src/rules.ts` are a hand-picked subset of
the Unicode emoji blocks, not the full emoji-data.txt property table, so a
handful of legitimate emoji outside those ranges won't be recognized as
emoji. Three or more regional indicators in a row are not currently
flagged even though they're ambiguous (should they pair as one flag plus
one lone letter, or something else) — see the roadmap.

## License

MIT, see LICENSE.
