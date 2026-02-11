#!/usr/bin/env node

/**
 * Post-processes TypeDoc markdown output into two consolidated MDX files:
 *   - classes.mdx   (all Class.*.md)
 *   - types.mdx     (TypeAlias.*.md + Interface.*.md)
 *
 * Fixes internal links, strips HTML anchors, removes implementation details,
 * and reshapes heading hierarchy.
 *
 * MDX angle-bracket sanitisation is handled by TypeDoc's `sanitizeComments`
 * option — see typedoc.json.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const INPUT_DIR = join(import.meta.dirname, '../generated/docs/api-reference');
const OUTPUT_DIR = join(import.meta.dirname, '../generated/docs');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Map from original filename → { target, anchor, classSlug? } */
function buildLinkMap(classFiles, typeFiles) {
  const map = new Map();
  for (const f of classFiles) {
    const name = extractName(f);
    const slug = slugify(name);
    map.set(basename(f), { target: 'classes', anchor: slug, classSlug: slug });
  }
  for (const f of typeFiles) {
    const name = extractName(f);
    map.set(basename(f), { target: 'types', anchor: slugify(name) });
  }
  return map;
}

/** Extract the display name from the first heading of a file */
function extractName(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const m = content.match(/^#\s+(?:Class|Type Alias|Interface):\s*(.+)$/m);
  return m ? m[1].trim() : basename(filePath, '.md');
}

/** GitHub-flavored markdown slug */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

/**
 * Strip a markdown h2 section (heading + body) up to the next h2 or EOF.
 * No `m` flag so `$` means true end-of-string.
 */
function stripH2Section(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\n## ${escaped}\\n[\\s\\S]*?(?=\\n## |$)`, 'g');
  return content.replace(re, '\n');
}

// ── shared pre-processing ───────────────────────────────────────────────────

function preProcess(content, filePath) {
  // Strip "## Implements"
  content = stripH2Section(content, 'Implements');

  // Strip constructors for internal API classes (users don't construct them)
  const internalAPIs = new Set([
    'SonioxFilesAPI',
    'SonioxSttApi',
    'SonioxModelsAPI',
    'SonioxWebhooksAPI',
    'SonioxAuthAPI',
    'SonioxRealtimeApi',
    // Error classes — users catch these but don't construct them
    'SonioxError',
    'SonioxHttpError',
    'RealtimeError',
    'AuthError',
    'BadRequestError',
    'QuotaError',
    'ConnectionError',
    'NetworkError',
    'AbortError',
    'StateError',
  ]);
  if (internalAPIs.has(extractName(filePath))) {
    content = stripH2Section(content, 'Constructors');
  }

  // Strip "#### Implementation of" blocks
  content = content.replace(/\n#### Implementation of\n[\s\S]*?(?=\n#{1,5} |\n\*\*\*|$)/g, '');

  // Strip <a id="..."></a> HTML tags
  content = content.replace(/<a id="[^"]*"><\/a>\s*/g, '');

  // Rewrite top heading: "# Class: Foo" → "## Foo"
  content = content.replace(/^#\s+(?:Class|Type Alias|Interface):\s*(.+)$/m, '## $1');

  return content;
}

function rewriteLinks(content, linkMap) {
  return content.replace(/\[([^\]]*)\]\(([^)]+\.md)(?:#([^)]*))?\)/g, (_match, text, file, fragment) => {
    const entry = linkMap.get(file);
    if (!entry) return _match;
    // For class files, prefix method-level fragments with the class slug
    if (fragment && entry.classSlug) {
      return `[${text}](${entry.target}#${entry.classSlug}-${fragment})`;
    }
    return `[${text}](${entry.target}#${fragment || entry.anchor})`;
  });
}

function cleanUp(content) {
  return content.replace(/\n{4,}/g, '\n\n\n').trim();
}

// ── class file processing ───────────────────────────────────────────────────
//
// Target hierarchy:
//   ## ClassName
//   ### Constructor | ### methodName() | ### propertyName
//   **Parameters** / **Returns** / **Throws** / **Example**
//
// Group headings (Constructors, Methods, Accessors) are removed.
// Properties / Example keep their ### heading.

const STRIP_H2 = new Set(['Constructors', 'Methods', 'Accessors']);
const STRIP_H4 = new Set(['Get Signature', 'Set Signature']);

function processClassFile(filePath, linkMap) {
  let content = preProcess(readFileSync(filePath, 'utf-8'), filePath);

  const lines = content.split('\n');
  let classSlug = '';
  let firstH2 = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,6})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2];

    // First ## is the class name — keep as-is
    if (!firstH2 && level === 2) {
      firstH2 = true;
      classSlug = slugify(text);
      continue;
    }

    if (level === 2) {
      if (STRIP_H2.has(text)) {
        lines[i] = ''; // remove group headings
      } else {
        // Section headings (Properties, Example) → ### with anchor
        const anchor = `${classSlug}-${slugify(text)}`;
        lines[i] = `<a id="${anchor}"></a>\n\n### ${text}`;
      }
    } else if (level === 3) {
      // Individual method / constructor / accessor → ### with anchor
      const anchor = `${classSlug}-${slugify(text)}`;
      lines[i] = `<a id="${anchor}"></a>\n\n### ${text}`;
    } else if (level === 4 && STRIP_H4.has(text)) {
      lines[i] = ''; // drop "Get Signature" / "Set Signature"
    } else {
      // Parameters, Returns, Throws, Example, Type Parameters, etc. → bold
      lines[i] = `**${text}**`;
    }
  }

  content = rewriteLinks(lines.join('\n'), linkMap);
  return cleanUp(content);
}

// ── type file processing ────────────────────────────────────────────────────
//
// Target hierarchy:
//   ## TypeName
//   **everything else bold**

function processTypeFile(filePath, linkMap) {
  let content = preProcess(readFileSync(filePath, 'utf-8'), filePath);

  const lines = content.split('\n');
  let firstH2 = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,6})\s+(.+)$/);
    if (!m) continue;

    if (!firstH2 && m[1].length === 2) {
      firstH2 = true;
      continue;
    }
    lines[i] = `**${m[2]}**`;
  }

  content = rewriteLinks(lines.join('\n'), linkMap);
  return cleanUp(content);
}

// ── main ────────────────────────────────────────────────────────────────────

const allFiles = readdirSync(INPUT_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => join(INPUT_DIR, f))
  .sort();

const classFiles = allFiles.filter((f) => basename(f).startsWith('Class.'));
const typeAliasFiles = allFiles.filter((f) => basename(f).startsWith('TypeAlias.'));
const interfaceFiles = allFiles.filter((f) => basename(f).startsWith('Interface.'));
const typeFiles = [...typeAliasFiles, ...interfaceFiles].sort();

const linkMap = buildLinkMap(classFiles, typeFiles);

// ── Desired class order ─────────────────────────────────────────────────────

const classOrder = [
  'Class.SonioxNodeClient.md',
  'Class.SonioxFilesAPI.md',
  'Class.SonioxSttApi.md',
  'Class.SonioxModelsAPI.md',
  'Class.SonioxWebhooksAPI.md',
  'Class.SonioxAuthAPI.md',
  'Class.SonioxRealtimeApi.md',
  'Class.SonioxFile.md',
  'Class.SonioxTranscription.md',
  'Class.SonioxTranscript.md',
  'Class.FileListResult.md',
  'Class.TranscriptionListResult.md',
  'Class.RealtimeSttSession.md',
  'Class.RealtimeSegmentBuffer.md',
  'Class.RealtimeUtteranceBuffer.md',
  // Error classes
  'Class.SonioxError.md',
  'Class.SonioxHttpError.md',
  'Class.RealtimeError.md',
  'Class.AuthError.md',
  'Class.BadRequestError.md',
  'Class.QuotaError.md',
  'Class.ConnectionError.md',
  'Class.NetworkError.md',
  'Class.AbortError.md',
  'Class.StateError.md',
];

const orderedClassFiles = classOrder.map((name) => classFiles.find((f) => basename(f) === name)).filter(Boolean);
for (const f of classFiles) {
  if (!orderedClassFiles.includes(f)) orderedClassFiles.push(f);
}

// ── Build classes.mdx ───────────────────────────────────────────────────────

const classSections = orderedClassFiles.map((f) => processClassFile(f, linkMap));

const classesContent = `---
title: "Classes"
description: "Soniox Node SDK — Class Reference"
---

${classSections.join('\n\n---\n\n')}
`;

// ── Build types.mdx ─────────────────────────────────────────────────────────

const orderedTypeFiles = [...typeAliasFiles.sort(), ...interfaceFiles.sort()];
const typeSections = orderedTypeFiles.map((f) => processTypeFile(f, linkMap));

const typesContent = `---
title: "Types"
description: "Soniox Node SDK — Types Reference"
---

${typeSections.join('\n\n---\n\n')}
`;

// ── Write ───────────────────────────────────────────────────────────────────

writeFileSync(join(OUTPUT_DIR, 'classes.mdx'), classesContent);
writeFileSync(join(OUTPUT_DIR, 'types.mdx'), typesContent);

console.log(`✓ classes.mdx  (${orderedClassFiles.length} classes, ${(classesContent.length / 1024).toFixed(1)} KB)`);
console.log(`✓ types.mdx    (${orderedTypeFiles.length} types, ${(typesContent.length / 1024).toFixed(1)} KB)`);
