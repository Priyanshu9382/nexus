import leoProfanity from "leo-profanity";

// Bug-fix #16: Load the full English dictionary at module initialization.
// Without this call, leoProfanity.check() operates on an empty word list.
leoProfanity.loadDictionary("en");

// Leetspeak map to reverse visually confusing character substitutions
const normalizeMap: Record<string, string> = {
    '@': 'a',
    '4': 'a',
    '0': 'o',
    '1': 'i',
    '!': 'i',
    '$': 's',
    '5': 's',
    '+': 't',
    '3': 'e'
};

export function isProfane(text: string): boolean {
    if (!text) return false;

    // 1. Basic word check (catches normal bad words)
    if (leoProfanity.check(text)) return true;

    // 2. Evasive check: strip spaces/punctuation (e.g. "b a d w o r d" → "badword")
    const noSpace = text.replace(/[\s\-_.,?!]+/g, '');

    // 3. Normalize leetspeak
    const normalized = noSpace.toLowerCase().split('').map(char => normalizeMap[char] || char).join('');

    // 4. Substring scan against the word list (words ≥ 4 chars to limit false positives)
    const badWords = leoProfanity.list();
    for (const word of badWords) {
        if (word.length >= 4 && normalized.includes(word)) {
            return true;
        }
    }

    return false;
}
