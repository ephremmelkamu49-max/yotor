const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can",
  "cannot", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further",
  "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out",
  "over", "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
  "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too", "under",
  "until", "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "with", "would", "you", "your", "yours", "yourself", "yourselves",
  // Common visual / storytelling filler words
  "hero", "heroic", "character", "man", "woman", "person", "people", "walked", "walks", "walking", "standing",
  "sitting", "looking", "going", "goes", "went", "saw", "seeing", "talks", "talking", "says", "said", "shows",
  "showing", "scene", "shot", "video", "clip", "footage", "stock", "cinematic", "professional", "movement",
  "depth", "field", "hd", "4k", "8k", "photorealistic", "ultra", "3d", "2d", "render", "rendering", "style",
  "illustration", "digital", "painting", "highly", "detailed", "epic", "storytelling", "aesthetic", "vibrant",
  "beautiful", "gorgeous", "artistic", "stunning", "glorious", "breathtaking", "background", "concept", "art"
]);

// Common historical figures, landmarks, and indicators
const HISTORICAL_KEYWORDS = new Set([
  "einstein", "lincoln", "napoleon", "cleopatra", "churchill", "gandhi", "mandela", "shakespeare", "davinci",
  "caesar", "king", "washington", "tesla", "newton", "mozart", "beethoven", "hitler", "stalin", "roosevelt",
  "socrates", "plato", "aristotle", "jesus", "buddha", "muhammad", "joanofarc", "victoria", "genghis", "columbus",
  "eiffel", "pyramids", "pyramid", "tajmahal", "colosseum", "greatwall", "machupicchu", "statueofliberty", "bigben",
  "grandcanyon", "everest", "louvre", "vatican", "kremlin", "whitehouse", "parthenon", "stonehenge", "burjkhalifa",
  "worldwar", "renaissance", "coldwar", "titanic", "apollo11", "chernobyl", "romanempire", "ancientegypt",
  "addisababa", "haileselassie", "menelik", "axum", "lalibela", "ethiopia", "history", "historical", "portrait"
]);

/**
 * Named Entity Recognition (NER) Helper
 * Detects if a scene describes a specific real person, historical figure, or famous location (Proper Noun).
 */
export function detectNamedEntity(keywords?: string, text?: string, entityProp?: string): string | null {
  if (entityProp && entityProp.trim().length > 2) {
    return entityProp.trim();
  }

  const combined = `${keywords || ''} ${text || ''}`;
  
  // 1. Look for capitalized 2-3 word proper nouns (e.g. "Albert Einstein", "Eiffel Tower", "Winston Churchill", "World War II")
  const properNounMatch = combined.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
  if (properNounMatch && properNounMatch[1]) {
    const candidate = properNounMatch[1].trim();
    // Exclude generic sentence starters
    if (!/^(The|In|On|At|For|With|This|That)\s+(Video|Shot|Scene|Clip|Background|Style)$/i.test(candidate)) {
      return candidate;
    }
  }

  // 2. Check for historical keywords in lowercase string
  const cleanLower = combined.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = cleanLower.split(/\s+/);
  for (const word of words) {
    if (HISTORICAL_KEYWORDS.has(word)) {
      const foundMatch = combined.match(new RegExp(`\\b[A-Za-z\\s]{0,20}${word}[A-Za-z\\s]{0,20}\\b`, "i"));
      if (foundMatch) {
        return foundMatch[0].trim();
      }
      return word;
    }
  }

  return null;
}

/**
  * Extract 1-2 visually descriptive English keywords per scene (e.g. "dark forest").
  * Provides a cascading list of fallbacks down to broader keywords if search yields 0 results.
  */
export function extractDescriptiveQueries(keywords?: string, text?: string): string[] {
  const combined = `${keywords || ''} ${text || ''}`;
  
  // Strip non-ASCII
  const asciiOnly = combined.replace(/[^\x00-\x7F]+/g, " ");
  // Remove punctuation
  const cleanStr = asciiOnly.replace(/[^a-zA-Z\s]/g, " ").toLowerCase();
  
  // Tokenize & filter stop words
  const tokens = cleanStr
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));

  const uniqueTokens = Array.from(new Set(tokens));

  const queries: string[] = [];

  if (uniqueTokens.length >= 2) {
    // Level 1: Primary 1-2 visually descriptive English keywords (e.g., "dark forest")
    queries.push(`${uniqueTokens[0]} ${uniqueTokens[1]}`);
    // Level 2: Single primary noun (e.g. "forest")
    queries.push(uniqueTokens[0]);
    // Level 3: Secondary noun (e.g. "dark")
    queries.push(uniqueTokens[1]);
  } else if (uniqueTokens.length === 1) {
    queries.push(uniqueTokens[0]);
  }

  // Level 4: Broader category fallback keywords
  queries.push("nature landscape", "city night", "space cosmos", "abstract background", "technology");

  return Array.from(new Set(queries.filter(q => q && q.trim().length > 1)));
}
