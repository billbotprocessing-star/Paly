// Run: deno test supabase/functions/generate-set/validate.test.ts
import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { validate, type ChunkRow } from './validate.ts';

const chunks: ChunkRow[] = [
  { id: 'c0', ordinal: 0, text: 'Mitochondria produce ATP.' },
  { id: 'c1', ordinal: 1, text: 'Ribosomes build proteins.' },
];

Deno.test('keeps well-formed concepts and maps passages to chunk ids', () => {
  const out = validate(
    [
      {
        name: 'Mitochondria',
        explanation: 'They make ATP.',
        passages: [0, 0, 1],
        items: [
          { item_type: 'short_answer', prompt: 'What makes ATP?', answer: 'Mitochondria' },
          { item_type: 'cloze', prompt: '_____ produce ATP.', answer: 'Mitochondria' },
        ],
      },
    ],
    chunks
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].chunkIds, ['c0', 'c1']);
  assertEquals(out[0].items.length, 2);
});

Deno.test('drops concepts citing passages that do not exist (no untraceable claims)', () => {
  const out = validate(
    [
      { name: 'Made up', explanation: 'x', passages: [7], items: [{ item_type: 'short_answer', prompt: 'q', answer: 'a' }] },
      { name: 'Ribosomes', explanation: 'y', passages: [1], items: [{ item_type: 'short_answer', prompt: 'q', answer: 'a' }] },
    ],
    chunks
  );
  assertEquals(out.map((c) => c.name), ['Ribosomes']);
});

Deno.test('drops bad items: unknown type, empty fields, cloze without a blank', () => {
  const out = validate(
    [
      {
        name: 'Ribosomes',
        explanation: 'y',
        passages: [1],
        items: [
          { item_type: 'essay', prompt: 'q', answer: 'a' },
          { item_type: 'short_answer', prompt: '  ', answer: 'a' },
          { item_type: 'cloze', prompt: 'Ribosomes build proteins.', answer: 'proteins' },
          { item_type: 'explain_back', prompt: 'Explain ribosomes', answer: 'They build proteins.' },
        ],
      },
    ],
    chunks
  );
  assertEquals(out[0].items.map((i) => i.item_type), ['explain_back']);
});

Deno.test('caps items per concept at 3', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ item_type: 'short_answer', prompt: `q${i}`, answer: 'a' }));
  assertEquals(validate([{ name: 'n', explanation: 'e', passages: [0], items }], chunks)[0].items.length, 3);
});

Deno.test('throws when nothing usable comes back, so the job is marked failed', () => {
  assertThrows(() => validate('nope', chunks));
  assertThrows(() => validate([], chunks));
  assertThrows(() => validate([{ name: 'n', explanation: 'e', passages: [9], items: [] }], chunks));
});
