import type { Scrap, StudyCard } from './types';

// Stand-in for the real AI chat: keeps the Clarify screen usable end-to-end
// without a backend. Swap this for a real model call later.
export function buddyReply(scrap: Scrap, turnCount: number): string {
  if (turnCount === 0) {
    return `Okay, let's look at "${scrap.title}" together. What part is tripping you up — walk me through what you already tried.`;
  }
  if (turnCount === 1) {
    return "That makes sense as a starting point. Here's a simpler way to think about it — want me to break it into smaller steps?";
  }
  if (turnCount === 2) {
    return "Good, that's the key idea. I think we have enough to turn this into something you can study from — tap Ship when you're ready.";
  }
  return "Noted — I've folded that into the explanation. Anything else feel unclear before we ship this?";
}

export function buildStudyCard(scrap: Scrap): StudyCard {
  return {
    summary: `Plain-language recap of "${scrap.title}"`,
    points: [
      scrap.subtitle,
      'Broken into small, ordered steps during clarify.',
      'Ready to review before your next quiz or worksheet.',
    ],
  };
}
