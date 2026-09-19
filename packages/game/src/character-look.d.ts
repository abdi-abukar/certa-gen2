export type CharacterLook = { skinTone: string; hairColor: string; outfitColor: string; hair: string; top: string; hat: string; glasses: string; facialHair: string; background: string };
export function normalizeLook(input: unknown): CharacterLook;
export function buildCharacterSheetDataUrl(input: unknown, spriteUrl?: string): Promise<string>;
