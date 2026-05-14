export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  const base64Data = image.split(',')[1];
  
  // Try providers in order: Groq (if available), then Gemini, then Mistral
  
  // 1. TRY GROQ (Llama 3.2 Vision - Ultra Fast & Generous Free Tier)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.2-11b-vision-preview",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Identify every MTG card in this image. Group identical cards by name and sum their quantities. Return ONLY a JSON array of objects like [{\"name\":\"Card Name\",\"qty\":4}]. No markdown, no comments." },
              { type: "image_url", image_url: { url: image } }
            ]
          }],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        let content = data.choices[0].message.content;
        let parsed = JSON.parse(content);
        // Sometimes it returns { "cards": [...] } or just [...]
        let cards = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.items || []);
        if (cards.length > 0) return res.status(200).json(cards);
      }
    } catch (e) {
      console.warn("[MTG-AI] Groq failed:", e.message);
    }
  }

  // 2. TRY GEMINI (Google - The standard fallback)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const models = ["gemini-1.5-flash", "gemini-2.0-flash"];
    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "ACT AS A PROFESSIONAL MTG CARD SCANNER. Identify every card in the image. Group identical cards by name and sum their quantities. Return ONLY a JSON array of objects like [{\"name\":\"Island\",\"qty\":22}]. No markdown." },
                { inline_data: { mime_type: "image/jpeg", data: base64Data } }
              ]
            }],
            generationConfig: { temperature: 0.1 }
          })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          let parsed = JSON.parse(jsonMatch[0]);
          if (parsed.length > 0) return res.status(200).json(parsed);
        }
      } catch (e) {
        console.warn(`[MTG-AI] Gemini ${model} failed:`, e.message);
      }
    }
  }

  // 3. TRY MISTRAL (Pixtral - Modern Vision)
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "pixtral-12b-2409",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Return a JSON array of MTG cards in this image: [{\"name\":string, \"qty\":number}]." },
              { type: "image_url", image_url: image }
            ]
          }],
          response_format: { type: "json_object" }
        })
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        let parsed = JSON.parse(content);
        let cards = Array.isArray(parsed) ? parsed : (parsed.cards || []);
        if (cards.length > 0) return res.status(200).json(cards);
      }
    } catch (e) {
      console.warn("[MTG-AI] Mistral failed:", e.message);
    }
  }

  return res.status(500).json({ 
    error: "[MTG-AI] Tutti i servizi AI sono al momento non disponibili o le chiavi API sono errate. Per favore controlla le impostazioni di Vercel." 
  });
}
