// Validation of Claude's study-set output. Kept separate from index.ts so it
// can be unit-tested without starting the server (validate.test.ts).

export interface ChunkRow {
  id: string;
  ordinal: number;
  text: string;
}

export type ItemType = 'short_answer' | 'cloze' | 'explain_back';

export interface DraftItem {
  item_type: ItemType;
  prompt: string;
  answer: string;
}

export interface DraftConcept {
  name: string;
  explanation: string;
  chunkIds: string[];
  items: DraftItem[];
}

export const MAX_CONCEPTS = 30;
export const MAX_ITEMS_PER_CONCEPT = 3;
/** Keep only well-formed concepts whose passages exist; never trust model output blindly. */
export function validate(raw: unknown, chunks: ChunkRow[]): DraftConcept[] {
  if (!Array.isArray(raw)) throw new Error('claude_bad_shape');
  const byOrdinal = new Map(chunks.map((c) => [c.ordinal, c.id]));
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const out: DraftConcept[] = [];

  for (const c of raw.slice(0, MAX_CONCEPTS)) {
    const name = str(c?.name).slice(0, 120);
    const explanation = str(c?.explanation);
    const passages: unknown[] = Array.isArray(c?.passages) ? c.passages : [];
    const chunkIds: string[] = [
      ...new Set(
        passages
          .map((n) => byOrdinal.get(Number(n)))
          .filter((id): id is string => !!id)
      ),
    ];
    const items: DraftItem[] = (Array.isArray(c?.items) ? c.items : [])
      .map((i: Record<string, unknown>) => ({
        item_type: i?.item_type as ItemType,
        prompt: str(i?.prompt),
        answer: str(i?.answer),
      }))
      .filter(
        (i: DraftItem) =>
          ['short_answer', 'cloze', 'explain_back'].includes(i.item_type) &&
          i.prompt &&
          i.answer &&
          (i.item_type !== 'cloze' || i.prompt.includes('___'))
      )
      .slice(0, MAX_ITEMS_PER_CONCEPT);

    if (name && explanation && chunkIds.length > 0 && items.length > 0) {
      out.push({ name, explanation, chunkIds, items });
    }
  }
  if (out.length === 0) throw new Error('claude_no_usable_concepts');
  return out;
}

