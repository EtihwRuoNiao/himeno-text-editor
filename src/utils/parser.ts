import { TextBlock, FileData, ParserProfile } from '../types';

export const passthroughProfile: ParserProfile = {
  id: 'default',
  name: '默认规则',
  lineRegex: '^(?<prefix>)(?<text>.*)$',
};

export const dc3Profile: ParserProfile = {
  id: 'dc3',
  name: 'DC3',
  lineRegex: '^(?<prefix>★◎\\s*\\d+\\s*◎★(?://)?)(?<text>.*)$',
  idRegex: '^(?<id>#\\S+)$',
};

export { passthroughProfile as defaultProfile };

const parseLine = (line: string, regex: RegExp): { prefix: string; text: string } | null => {
  const m = line.match(regex);
  if (!m?.groups) return null;
  return { prefix: m.groups['prefix'], text: m.groups['text'] ?? '' };
};

const createBlock = (
  id: string,
  sourcePrefix: string, sourceText: string,
  targetPrefix: string, targetText: string,
  orphan?: boolean,
): TextBlock => ({
  id,
  sourcePrefix,
  sourceText,
  targetPrefix,
  targetText,
  originalSourceText: sourceText,
  originalTargetText: targetText,
  orphan: orphan || false,
});

const errorMsg = () => '';
// errorMsg is overridden at module init via setOrphanErrorMessage; see below.
let _orphanErrorMessage = '';
export const setOrphanErrorMessage = (msg: string) => { _orphanErrorMessage = msg; };
export const getOrphanErrorMessage = () => _orphanErrorMessage;

export const parseFile = (fileName: string, content: string, profile: ParserProfile = passthroughProfile): FileData => {
  const normalized = content.replace(/\r\n/g, '\n');
  const text = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];
  const blankLinesBefore: number[] = [];

  const lineRe = new RegExp(profile.lineRegex);
  const idRe = profile.idRegex && !profile.idRegexDisabled ? new RegExp(profile.idRegex) : null;

  let currentId = '';
  let srcPrefix = '';
  let srcText = '';
  let state = 0; // 0: idle (next match = source), 1: have source need target
  let blankCount = 0;
  let srcBlankCount = 0; // blank lines before the pending source
  let pendingBlankBeforeId = 0;
  let blankAfterId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      blankCount++;
      continue;
    }

    if (idRe) {
      const idMatch = line.match(idRe);
      if (idMatch?.groups) {
        pendingBlankBeforeId = blankCount;
        blankCount = 0;
        currentId = idMatch.groups['id'];
        continue;
      }
    }

    const parsed = parseLine(line, lineRe);
    if (parsed) {
      if (state === 0) {
        if (currentId) {
          blankAfterId = blankCount;
          srcBlankCount = pendingBlankBeforeId;
          pendingBlankBeforeId = 0;
        } else {
          blankAfterId = 0;
          srcBlankCount = blankCount;
        }
        srcPrefix = parsed.prefix;
        srcText = parsed.text;
        blankCount = 0;
        state = 1;
      } else {
        blankLinesBefore.push(srcBlankCount);
        srcBlankCount = 0;
        const newBlock = createBlock(currentId, srcPrefix, srcText, parsed.prefix, parsed.text);
        if (currentId && blankAfterId > 0) newBlock.blankLinesAfterId = blankAfterId;
        blocks.push(newBlock);
        currentId = '';
        blankAfterId = 0;
        state = 0;
      }
    } else {
      // Orphan line
      if (state === 1) {
        // Flush pending source with empty target
        blankLinesBefore.push(srcBlankCount);
        srcBlankCount = 0;
        const flushedBlock = createBlock(currentId, srcPrefix, srcText, '', '');
        if (currentId && blankAfterId > 0) flushedBlock.blankLinesAfterId = blankAfterId;
        blocks.push(flushedBlock);
        currentId = '';
        blankAfterId = 0;
        srcPrefix = '';
        srcText = '';
        state = 0;
      }
      blankLinesBefore.push(blankCount);
      blankCount = 0;
      blocks.push(createBlock('', '', _orphanErrorMessage, '', line, true));
      currentId = '';
      state = 0;
    }
  }

  // Flush remaining pending source as orphan
  if (state === 1 && srcText !== '') {
    blankLinesBefore.push(srcBlankCount);
    blocks.push(createBlock('', '', _orphanErrorMessage, '', srcPrefix + srcText, true));
  }

  return {
    name: fileName,
    blocks,
    blankLinesBefore,
    trailingBlankLines: blankCount,
    rawContent: content,
  };
};

export const serializeFile = (
  blocks: TextBlock[],
  blankLinesBefore?: number[],
  trailingBlankLines?: number,
): string => {
  let result = '';
  if (blankLinesBefore && blankLinesBefore.length > 0 && blankLinesBefore[0] > 0) {
    result += '\n'.repeat(blankLinesBefore[0]);
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.orphan) {
      result += `${block.targetPrefix}${block.targetText}\n`;
    } else {
      const blockLines: string[] = [];
      if (block.id) blockLines.push(block.id);
      if (block.blankLinesAfterId) {
        for (let j = 0; j < block.blankLinesAfterId; j++) blockLines.push('');
      }
      blockLines.push(`${block.sourcePrefix}${block.sourceText}`);
      blockLines.push(`${block.targetPrefix}${block.targetText}`);
      result += blockLines.join('\n') + '\n';
    }
    if (i < blocks.length - 1 && blankLinesBefore && i + 1 < blankLinesBefore.length) {
      result += '\n'.repeat(blankLinesBefore[i + 1]);
    }
  }
  if (trailingBlankLines) {
    result += '\n'.repeat(trailingBlankLines);
  }
  return result;
};

function countIdRegexMatches(content: string, idRegex: string): number {
  if (!idRegex) return 0;
  const re = new RegExp(idRegex);
  return content.replace(/\r\n/g, '\n').split('\n')
    .filter(l => { const t = l.trim(); return t !== '' && re.test(t); }).length;
}

export interface ValidationResult {
  valid: boolean;
  lineRatio: number;
  charRatio: number;
  idOverCapture: boolean;
}

export function validateProfile(content: string, profile: ParserProfile): ValidationResult {
  const normalized = content.replace(/\r\n/g, '\n');
  const originalNonBlank = normalized.split('\n').filter(l => l.trim() !== '').length;

  const refResult = parseFile('__ref__', normalized, passthroughProfile);
  const refChars = serializeFile(refResult.blocks, refResult.blankLinesBefore, refResult.trailingBlankLines).length;

  const newResult = parseFile('__candidate__', normalized, profile);
  const newBlocks = newResult.blocks;
  const newChars = serializeFile(newBlocks, newResult.blankLinesBefore, newResult.trailingBlankLines).length;

  const effectiveIdRegex = profile.idRegexDisabled ? undefined : profile.idRegex;
  const matchedIdCount = countIdRegexMatches(normalized, effectiveIdRegex || '');
  const normalBlocks = newBlocks.filter(b => !b.orphan).length;
  const orphanBlocks = newBlocks.length - normalBlocks;
  const expectedLines = normalBlocks * 2 + orphanBlocks + matchedIdCount;
  const lineRatio = originalNonBlank > 0
    ? Math.abs(expectedLines - originalNonBlank) / originalNonBlank
    : 0;
  const charRatio = refChars > 0
    ? Math.abs(newChars - refChars) / refChars
    : 0;

  const orphanRatio = newBlocks.length > 0 ? orphanBlocks / newBlocks.length : 0;
  const idOverCapture = normalBlocks === 0 && orphanBlocks === 0 && matchedIdCount > 0;

  return {
    valid: !idOverCapture && orphanRatio <= 0.10 && lineRatio <= 0.10 && charRatio <= 0.50,
    lineRatio,
    charRatio,
    idOverCapture,
  };
}

export const findLastSourceLine = (content: string, profile: ParserProfile = passthroughProfile): string | null => {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const lineRe = new RegExp(profile.lineRegex);

  let lastSourceText: string | null = null;
  let state = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;

    const parsed = parseLine(lines[i], lineRe);
    if (!parsed) continue;

    if (state === 0) {
      lastSourceText = parsed.text;
      state = 1;
    } else {
      state = 0;
    }
  }

  return lastSourceText;
};
