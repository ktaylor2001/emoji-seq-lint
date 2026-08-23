// Codepoint ranges used to classify emoji-related characters. This is a
// hand-picked subset of the emoji blocks in the Unicode standard, not the
// full emoji-data.txt property table. It covers the common pictographic
// ranges well enough to reason about joins and modifiers; it will miss some
// legitimate emoji (e.g. a handful of pre-Unicode-9 symbols) and will not
// catch every malformed sequence. See README for known gaps.

export const ZWJ = 0x200d;
export const VS15_TEXT = 0xfe0e;
export const VS16_EMOJI = 0xfe0f;

export const REGIONAL_INDICATOR_START = 0x1f1e6;
export const REGIONAL_INDICATOR_END = 0x1f1ff;

export const SKIN_TONE_START = 0x1f3fb;
export const SKIN_TONE_END = 0x1f3ff;

const EMOJI_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x2300, 0x23ff], // misc technical (hourglass, watch, alarm clock, ...)
  [0x2600, 0x26ff], // misc symbols
  [0x2700, 0x27bf], // dingbats
  [0x1f300, 0x1f5ff], // misc symbols and pictographs
  [0x1f600, 0x1f64f], // emoticons
  [0x1f680, 0x1f6ff], // transport and map symbols
  [0x1f900, 0x1f9ff], // supplemental symbols and pictographs
  [0x1fa70, 0x1faff], // symbols and pictographs extended-a
];

export function isEmojiCodepoint(cp: number): boolean {
  if (isRegionalIndicator(cp)) return true;
  return EMOJI_BLOCKS.some(([start, end]) => cp >= start && cp <= end);
}

export function isRegionalIndicator(cp: number): boolean {
  return cp >= REGIONAL_INDICATOR_START && cp <= REGIONAL_INDICATOR_END;
}

export function isSkinToneModifier(cp: number): boolean {
  return cp >= SKIN_TONE_START && cp <= SKIN_TONE_END;
}

export function isVariationSelector(cp: number): boolean {
  return cp === VS15_TEXT || cp === VS16_EMOJI;
}
