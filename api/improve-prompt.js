export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Act as a professional MTG Art Director. Transform the following user idea into a highly detailed image generation prompt for Stable Diffusion/DALL-E 3.
              Idea: "${prompt}"
              Style: Epic Fantasy Oil Painting, MTG Style.
              Rules:
              - Describe cinematic lighting, intricate textures, and atmospheric perspective.
              - Focus on composition and color palette.
              - NO text, NO card borders.
              - Be concise but extremely descriptive.
              Return ONLY the improved prompt text.`
            }]
          }]
        })
      }
    );

    const data = await response.json();
    const improvedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text || prompt;
    return res.status(200).json({ improvedPrompt });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
