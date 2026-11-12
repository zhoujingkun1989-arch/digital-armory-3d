import type { WeaponId } from '../weapons/types';

export type LanguageCode = 'zh' | 'en';

export interface StoryActItem {
  id: string;
  actNumber: string;
  eraTag: string;
  title: string;
  paragraphs: string[];
  audioScript: string;
  audioUrl: string;
  focusPartId?: string | null;
  focusPartLabel?: string | null;
}

export interface StoryBreakthroughItem {
  id: string;
  title: string;
  tag: string;
  summary: string;
  focusPartId: string;
  focusPartLabel: string;
}

export interface StoryMilestoneItem {
  year: string;
  title: string;
  detail: string;
}

export interface LocalizedWeaponStory {
  headline: string;
  deck: string;
  acts: StoryActItem[];
  breakthroughs: StoryBreakthroughItem[];
  milestones: StoryMilestoneItem[];
}

export interface LocalizedPartNarration {
  roleTag: string;
  overview: string;
  craftAndMaterial: string;
  kinematicRole: string;
  designHighlight: string;
  audioScript: string;
  audioUrl: string;
}

export interface PartNarrationEntry {
  partId: string;
  bomCode: string;
  calloutLabelEn: string;
  zh: LocalizedPartNarration;
  en: LocalizedPartNarration;
}

export interface LocalizedWeaponUiMeta {
  name: string;
  subtitle: string;
  originCountry: string;
  weaponType: string;
  categoryLabel: string;
  actionMechanism: string;
  statusLabel: string;
  description: string;
  highlights: string[];
  workbenchTitle: string;
  workbenchSubtitle: string;
  cutawayLabel: string;
  cutawayTitle: string;
  searchPlaceholder: string;
  firingMilestoneLabel: string;
  rateOfFire: string;
  timelinePresets: Record<
    string,
    { label: string; subLabel: string; desc: string }
  >;
  firingPhases: Record<
    string,
    { shortLabel: string; title: string; description: string }
  >;
}

export interface WeaponNarrationBundle {
  schemaVersion: 1;
  weaponId: WeaponId;
  generatedAt: string;
  generatorModels: {
    text: string;
    storyTts: string;
    partTts: string;
  };
  uiMetaEn: LocalizedWeaponUiMeta;
  story: {
    zh: LocalizedWeaponStory;
    en: LocalizedWeaponStory;
  };
  parts: Record<string, PartNarrationEntry>;
}
