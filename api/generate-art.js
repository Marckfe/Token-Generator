export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, style = "MTG Style" } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  try {
    // 1. IMPROVE PROMPT (using a chat model first)
    const improveResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free', // Using free model for prompt improvement
        messages: [{
          role: 'user',
          content: `Transform this simple MTG token idea into a professional, highly detailed image generation prompt for DALL-E 3. 
          Idea: "${prompt}"
          Style: "${style}"
          Rules:
          - Use fantasy oil painting style.
          - Mention specific MTG artists like Magali Villeneuve or Greg Rutkowski.
          - Add cinematic lighting, hyper-detailed, epic scale.
          - Ensure it describes a standalone illustration, no text or card borders.
          Return ONLY the improved prompt text.`
        }],
        temperature: 0.7
      })
    });

    let finalPrompt = prompt;
    if (improveResponse.ok) {
      const improveData = await improveResponse.json();
      finalPrompt = improveData.choices?.[0]?.message?.content || prompt;
    }

    // 2. GENERATE IMAGE (Using DALL-E 3 via OpenRouter)
    // Note: If DALL-E 3 is too expensive, we could use Stability or other models available on OpenRouter
    const generateResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/dalle-3', 
        messages: [{
          role: 'user',
          content: finalPrompt
        }],
        // Image generation via Chat API is supported by some providers on OpenRouter 
        // OR we use the standard image generation endpoint if available.
        // Actually, OpenRouter handles image generation models via the same chat endpoint for some providers.
      })
    });

    // NOTE: Many OpenRouter providers for DALL-E 3 or Stability return the image URL in the content or as a tool call.
    // If the above doesn't work for the specific provider, we would use the direct image API if the user had the key.
    // BUT since we want to "use what's connected", we'll stick to OpenRouter's multimodal capabilities.

    // FALLBACK: If the above isn't enabled for the user's specific key/tier, we inform them.
    if (!generateResponse.ok) {
      const err = await generateResponse.json();
      return res.status(500).json({ error: `Generation failed: ${err.error?.message || 'Unknown error'}`, improvedPrompt: finalPrompt });
    }

    const data = await generateResponse.json();
    const imageUrl = data.choices?.[0]?.message?.content?.match(/https:\/\/\S+/)?.[0] || data.choices?.[0]?.message?.content;

    return res.status(200).json({
      imageUrl,
      improvedPrompt: finalPrompt,
      provider: 'OpenRouter'
    });

  } catch (e) {
    return res.status(500).json({ error: `Exception: ${e.message}` });
  }
}
