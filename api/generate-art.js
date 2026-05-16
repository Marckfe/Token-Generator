export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, style = "MTG Style" } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // Use Gemini as it's the most likely to be configured based on analyze.js
  const geminiKey = process.env.GEMINI_API_KEY;
  
  if (!geminiKey) {
    return res.status(500).json({ 
      error: 'GEMINI_API_KEY non configurata. Inseriscila nel file .env per attivare la generazione IA.',
      mock: true 
    });
  }

  try {
    // 1. IMPROVE PROMPT (using Gemini 2.0 Flash)
    const improveResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Transform this simple MTG token idea into a professional, highly detailed image generation prompt. 
              Idea: "${prompt}"
              Style: "${style}"
              Rules:
              - Use fantasy oil painting style.
              - Mention cinematic lighting, hyper-detailed, epic scale.
              - Describe a standalone illustration, no text or card borders.
              Return ONLY the improved prompt text.`
            }]
          }]
        })
      }
    );

    let finalPrompt = prompt;
    if (improveResponse.ok) {
      const improveData = await improveResponse.json();
      finalPrompt = improveData.candidates?.[0]?.content?.parts?.[0]?.text || prompt;
    }

    // 2. GENERATION LOGIC
    // Since Gemini standard API doesn't generate images directly (Imagen 3 is separate),
    // and the user wants to avoid OpenRouter, we provide the improved prompt.
    // In a real production environment, you'd call DALL-E 3 or Midjourney here.
    
    return res.status(200).json({
      imageUrl: null, // We return null to indicate we need an image gen provider
      improvedPrompt: finalPrompt,
      error: "Prompt ottimizzato con successo! Collega un servizio di generazione (DALL-E 3 o Stability) per vedere l'immagine."
    });

  } catch (e) {
    return res.status(500).json({ error: `Exception: ${e.message}` });
  }
}
