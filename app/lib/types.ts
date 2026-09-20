export type ScrapStatus = 'pale' | 'clarifying' | 'ready';

export type ScrapAccent = 'peach' | 'mint';

export type ChatRole = 'buddy' | 'student';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
}

export interface StudyCard {
  summary: string;
  points: string[];
}

export interface Scrap {
  id: string;
  title: string;
  subtitle: string;
  status: ScrapStatus;
  accent: ScrapAccent;
  createdAt: number;
  messages: ChatMessage[];
  studyCard?: StudyCard;
}
