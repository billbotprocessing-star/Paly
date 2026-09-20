import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { buddyReply, buildStudyCard } from './mock-clarify';
import type { ChatMessage, Scrap, ScrapAccent } from './types';

const STORAGE_KEY = 'paly.scraps.v1';

const SEED_SCRAPS: Scrap[] = [
  {
    id: 'seed-bio',
    title: 'Bio ch.4 — mitosis',
    subtitle: "I don't get the phases",
    status: 'clarifying',
    accent: 'peach',
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    messages: [],
  },
  {
    id: 'seed-calc',
    title: 'Calc practice',
    subtitle: 'Derivative of ln(x)?',
    status: 'ready',
    accent: 'mint',
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
    messages: [],
    studyCard: {
      summary: 'Derivative of ln(x) is 1/x',
      points: [
        'ln(x) is the natural log — its slope is exactly 1/x for x > 0.',
        'This falls out of the inverse-function derivative rule applied to e^x.',
        'Common mix-up: this is NOT the same as d/dx[log(x)] in base 10.',
      ],
    },
  },
];

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `scrap-${Date.now()}-${idCounter}`;
}

interface NewScrapInput {
  title: string;
  subtitle: string;
  accent?: ScrapAccent;
}

interface ScrapsContextValue {
  scraps: Scrap[];
  loaded: boolean;
  addScrap: (input: NewScrapInput) => Scrap;
  sendMessage: (scrapId: string, text: string) => void;
  shipScrap: (scrapId: string) => void;
  getScrap: (scrapId: string) => Scrap | undefined;
}

const ScrapsContext = createContext<ScrapsContextValue | null>(null);

export function ScrapsProvider({ children }: { children: ReactNode }) {
  const [scraps, setScraps] = useState<Scrap[]>([]);
  const [loaded, setLoaded] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setScraps(raw ? (JSON.parse(raw) as Scrap[]) : SEED_SCRAPS);
      } catch {
        setScraps(SEED_SCRAPS);
      } finally {
        hasLoadedRef.current = true;
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(scraps)).catch(() => {});
  }, [scraps]);

  const value = useMemo<ScrapsContextValue>(
    () => ({
      scraps,
      loaded,
      addScrap: ({ title, subtitle, accent }) => {
        const scrap: Scrap = {
          id: nextId(),
          title: title.trim() || 'Untitled scrap',
          subtitle: subtitle.trim() || 'Tap to clarify with Paly',
          status: 'pale',
          accent: accent ?? (scraps.length % 2 === 0 ? 'peach' : 'mint'),
          createdAt: Date.now(),
          messages: [],
        };
        setScraps((prev) => [scrap, ...prev]);
        return scrap;
      },
      sendMessage: (scrapId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setScraps((prev) =>
          prev.map((scrap) => {
            if (scrap.id !== scrapId) return scrap;
            const studentMsg: ChatMessage = {
              id: nextId(),
              role: 'student',
              text: trimmed,
              createdAt: Date.now(),
            };
            const turnCount = scrap.messages.filter((m) => m.role === 'buddy').length;
            const buddyMsg: ChatMessage = {
              id: nextId(),
              role: 'buddy',
              text: buddyReply(scrap, turnCount),
              createdAt: Date.now() + 1,
            };
            return {
              ...scrap,
              status: 'clarifying',
              messages: [...scrap.messages, studentMsg, buddyMsg],
            };
          })
        );
      },
      shipScrap: (scrapId) => {
        setScraps((prev) =>
          prev.map((scrap) =>
            scrap.id === scrapId
              ? { ...scrap, status: 'ready', studyCard: scrap.studyCard ?? buildStudyCard(scrap) }
              : scrap
          )
        );
      },
      getScrap: (scrapId) => scraps.find((s) => s.id === scrapId),
    }),
    [scraps, loaded]
  );

  return <ScrapsContext.Provider value={value}>{children}</ScrapsContext.Provider>;
}

export function useScraps() {
  const ctx = useContext(ScrapsContext);
  if (!ctx) throw new Error('useScraps must be used within a ScrapsProvider');
  return ctx;
}
