/**
 * Translation utility using OpenAI GPT-4o-mini
 * Provides language detection and translation to English
 * Uses existing OpenAI API key - no extra cost
 */

import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  isEnglish: boolean;
}

/**
 * Quick translate for queries - optimized for speed
 * ~200-300ms
 */
export async function translateQuery(query: string): Promise<string> {
  // Skip if likely English
  if (isLikelyEnglish(query)) {
    console.log('[Translation] Query appears to be English, skipping translation');
    return query;
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Translate the following text to English. Return ONLY the translation, nothing else.',
        },
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const translated = response.choices[0]?.message?.content?.trim() || query;
    console.log(`[Translation] Query translated: "${query}" → "${translated}"`);
    return translated;
  } catch (error) {
    console.error('[Translation] Query translation failed:', error);
    return query;
  }
}

/**
 * Translate text to English for content ingestion
 * Handles longer text by chunking
 */
export async function translateToEnglish(text: string): Promise<TranslationResult> {
  // Check if already English
  if (isLikelyEnglish(text)) {
    return {
      originalText: text,
      translatedText: text,
      detectedLanguage: 'en',
      isEnglish: true,
    };
  }

  try {
    // For long text, split into chunks
    const chunks = splitTextForTranslation(text);
    const translatedChunks: string[] = [];
    let detectedLang = 'unknown';

    for (let i = 0; i < chunks.length; i++) {
      const response = await getOpenAIClient().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: i === 0
              ? 'Translate the following text to English. On the first line, write only the detected language code (e.g., "hi" for Hindi, "es" for Spanish). On the next line, write the translation.'
              : 'Translate the following text to English. Return ONLY the translation.',
          },
          {
            role: 'user',
            content: chunks[i],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const result = response.choices[0]?.message?.content?.trim() || chunks[i];

      if (i === 0) {
        // Extract language code from first chunk
        const lines = result.split('\n');
        if (lines.length >= 2) {
          detectedLang = lines[0].trim().toLowerCase();
          translatedChunks.push(lines.slice(1).join('\n').trim());
        } else {
          translatedChunks.push(result);
        }
      } else {
        translatedChunks.push(result);
      }
    }

    const translatedText = translatedChunks.join(' ');
    console.log(`[Translation] Translated ${text.length} chars from ${detectedLang} to English`);

    return {
      originalText: text,
      translatedText,
      detectedLanguage: detectedLang,
      isEnglish: false,
    };
  } catch (error) {
    console.error('[Translation] Translation failed:', error);
    return {
      originalText: text,
      translatedText: text,
      detectedLanguage: 'unknown',
      isEnglish: false,
    };
  }
}

/**
 * Detect language of text
 */
export async function detectLanguage(text: string): Promise<string> {
  if (isLikelyEnglish(text)) {
    return 'en';
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Detect the language of the following text. Return ONLY the ISO 639-1 language code (e.g., "en", "hi", "es", "fr").',
        },
        {
          role: 'user',
          content: text.slice(0, 500),
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const lang = response.choices[0]?.message?.content?.trim().toLowerCase() || 'unknown';
    console.log(`[Translation] Detected language: ${lang}`);
    return lang;
  } catch (error) {
    console.error('[Translation] Language detection failed:', error);
    return 'unknown';
  }
}

/**
 * Simple heuristic to check if text is likely English
 * Avoids API call for obvious English text
 */
function isLikelyEnglish(text: string): boolean {
  const sample = text.slice(0, 300);

  // Check for non-Latin scripts (Devanagari, Chinese, Arabic, Cyrillic, etc.)
  const nonLatinPattern = /[\u0900-\u097F\u4E00-\u9FFF\u0600-\u06FF\u0980-\u09FF\u0A00-\u0A7F\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF]/;
  if (nonLatinPattern.test(sample)) {
    return false;
  }

  // Check if mostly ASCII characters
  const asciiCount = (sample.match(/[a-zA-Z]/g) || []).length;
  const totalLetters = (sample.match(/\p{L}/gu) || []).length;

  if (totalLetters === 0) return true;

  // If more than 80% ASCII letters, likely English
  return (asciiCount / totalLetters) > 0.8;
}

/**
 * Split text into chunks for translation
 */
function splitTextForTranslation(text: string, maxChunkSize: number = 3000): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  // Split by sentences
  const sentences = text.split(/(?<=[.!?।])\s+/);

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
