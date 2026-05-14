export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'Missing image' });

  const base64Data = image.split(',')[1];
  const mimeType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

  const errors = [];
  const MTG_PROMPT = `You are a professional Magic: The Gathering card recognition system.
Analyze this image carefully and identify ALL MTG cards visible.
IMPORTANT RULES:
- If cards are stacked/overlapping, count each distinct card separately
- Count the EXACT quantity of each card shown
- Use the EXACT official English card name from Scryfall
- Ignore card backs, tokens, and non-MTG items
Return ONLY a valid JSON array, no other text:
[{"name": "Card Name", "qty": 1}, {"name": "Another Card", "qty": 4}]`;

  // ──────────────────────────────────────────────
  // 1. GROQ — Llama 4 Scout (only non-deprecated vision model)
  // ──────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: MTG_PROMPT },
              { type: 'image_url', image_url: { url: image } }
            ]
          }],
          temperature: 0.1,
          max_tokens: 2048
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const cards = JSON.parse(jsonMatch[0]);
          if (Array.isArray(cards) && cards.length > 0) {
            return res.status(200).json({
              cards,
              provider: 'Groq',
              model: 'llama-4-scout-17b',
              debugLogs: errors
            });
          }
        }
        errors.push(`Groq: empty or unparseable response`);
      } else {
        const errData = await response.json().catch(() => ({}));
        errors.push(`Groq ${response.status}: ${errData?.error?.message || response.statusText}`);
      }
    } catch (e) {
      errors.push(`Groq exception: ${e.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // 2. GOOGLE GEMINI — 2.0 Flash (stable, best OCR)
  // ──────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of geminiModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: MTG_PROMPT },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }],
              generationConfig: { temperature: 0.05, maxOutputTokens: 2048 }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const cards = JSON.parse(jsonMatch[0]);
            if (Array.isArray(cards) && cards.length > 0) {
              return res.status(200).json({
                cards,
                provider: 'Google',
                model,
                debugLogs: errors
              });
            }
          }
          errors.push(`Gemini ${model}: empty response`);
        } else {
          const errData = await response.json().catch(() => ({}));
          errors.push(`Gemini ${model} ${response.status}: ${errData?.error?.message || response.statusText}`);
        }
      } catch (e) {
        errors.push(`Gemini ${model} exception: ${e.message}`);
      }
    }
  }

  // ──────────────────────────────────────────────
  // 3. MISTRAL — Pixtral Large (current vision model)
  // ──────────────────────────────────────────────
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    const mistralModels = ['pixtral-large-latest', 'pixtral-12b-2409'];
    for (const model of mistralModels) {
      try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${mistralKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: MTG_PROMPT },
                { type: 'image_url', image_url: { url: image } }
              ]
            }],
            temperature: 0.1,
            max_tokens: 2048
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const cards = JSON.parse(jsonMatch[0]);
            if (Array.isArray(cards) && cards.length > 0) {
              return res.status(200).json({
                cards,
                provider: 'Mistral',
                model,
                debugLogs: errors
              });
            }
          }
          errors.push(`Mistral ${model}: empty response`);
        } else {
          const errData = await response.json().catch(() => ({}));
          errors.push(`Mistral ${model} ${response.status}: ${errData?.error?.message || response.statusText}`);
        }
      } catch (e) {
        errors.push(`Mistral ${model} exception: ${e.message}`);
      }
    }
  }

  // ──────────────────────────────────────────────
  // 4. OPENROUTER — Free vision models (final fallback)
  // ──────────────────────────────────────────────
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    const orModels = [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-4-scout:free',
      'qwen/qwen2.5-vl-72b-instruct:free'
    ];
    for (const model of orModels) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://token-generator-qcwg.vercel.app',
            'X-Title': 'MTG Tools'
          },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: MTG_PROMPT },
                { type: 'image_url', image_url: { url: image } }
              ]
            }],
            temperature: 0.1
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const cards = JSON.parse(jsonMatch[0]);
            if (Array.isArray(cards) && cards.length > 0) {
              return res.status(200).json({
                cards,
                provider: 'OpenRouter',
                model: model.split('/').pop().split(':')[0],
                debugLogs: errors
              });
            }
          }
          errors.push(`OpenRouter ${model}: empty response`);
        } else {
          errors.push(`OpenRouter ${model} ${response.status}: ${response.statusText}`);
        }
      } catch (e) {
        errors.push(`OpenRouter ${model} exception: ${e.message}`);
      }
    }
  }

  // All providers failed
  return res.status(200).json({
    error: `All AI providers failed. Errors: ${errors.join(' | ')}`,
    debugLogs: errors
  });
}
