import { getGrokKey } from './grok-client';

const XAI_TTS_URL = 'https://api.x.ai/v1/tts';

export interface TTSOptions {
  voiceId?: 'eve' | 'ara' | 'rex' | 'sal' | 'leo';
  language?: string;
  sampleRate?: number;
}

export async function callGrokTTS(
  text: string,
  options: TTSOptions = {}
): Promise<{ audio: Buffer; mimeType: string }> {
  const apiKey = getGrokKey('tts');
  if (!apiKey) {
    throw new Error('Grok TTS API key not configured (GROK_KEY_TTS)');
  }

  const voice_id = options.voiceId || 'eve';
  const language = options.language || 'en';
  const sample_rate = options.sampleRate || 24000;

  const response = await fetch(XAI_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id,
      language,
      output_format: {
        codec: 'mp3',
        sample_rate
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Grok TTS error:', response.status, errorText);
    throw new Error(`Grok TTS failed: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: Buffer.from(arrayBuffer),
    mimeType: 'audio/mpeg',
  };
}
