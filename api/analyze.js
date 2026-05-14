export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  const base64Data = image.split(',')[1];
  
  // Try providers in order: Groq (if available), then Gemini, then Mistral
  
  const errors = [];
  
  // 1. TRY GROQ (Llama 3.2 Vision - Ultra Fast & Generous Free Tier)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groqModels = ["llama-3.2-90b-vision-preview", "llama-3.2-11b-vision-preview"];
    for (const model of groqModels) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "ACT AS A PROFESSIONAL MTG OCR. Identify every card in this image. COUNT STACKED CARDS. Return ONLY JSON array like [{\"name\":\"Card Name\",\"qty\":4}]." },
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
          let cards = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.items || []);
          if (cards.length > 0) return res.status(200).json({ cards, provider: "Groq", model, debugLogs: errors });
        } else if (data.error) {
          errors.push(`Groq ${model}: ${data.error.message || JSON.stringify(data.error)}`);
        }
      } catch (e) {
        errors.push(`Groq ${model} exception: ${e.message}`);
      }
    }
  }

  // 2. TRY GEMINI (Google - 2.0 Flash is much better at OCR)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const models = ["gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash"];
    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "ACT AS A PROFESSIONAL MTG OCR SYSTEM. Scan this image and list EVERY card. COUNT STACKED CARDS CAREFULLY. Be extremely precise with names. Return ONLY JSON array: [{\"name\":\"Card Name\",\"qty\":4}]." },
                { inline_data: { mime_type: "image/jpeg", data: base64Data } }
              ]
            }],
            generationConfig: { temperature: 0.05 }
          })
        });

        const data = await response.json();
        if (data.error) {
          errors.push(`Gemini ${model}: ${data.error.message}`);
          continue;
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          let parsed = JSON.parse(jsonMatch[0]);
          if (parsed.length > 0) return res.status(200).json({ cards: parsed, provider: "Google", model, debugLogs: errors });
        }
      } catch (e) {
        errors.push(`Gemini ${model} exception: ${e.message}`);
      }
    }
  }

  // 3. TRY MISTRAL (Pixtral - Modern Vision)
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    const model = "pixtral-12b-2409";
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Identify every MTG card in this image. IMPORTANT: Some cards are stacked/overlapping, count them carefully! Return a JSON array of MTG cards: [{\"name\":string, \"qty\":number}]." },
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
        if (cards.length > 0) return res.status(200).json({ cards, provider: "Mistral", model, debugLogs: errors });
      } else if (data.error) {
        errors.push(`Mistral: ${data.error.message}`);
      }
    } catch (e) {
      errors.push(`Mistral exception: ${e.message}`);
    }
  }

  return res.status(200).json({ 
    error: `[MTG-AI-HUB-V3] Fallimento totale. Log: ${errors.join(" | ")}`,
    debugLogs: errors
  });
}
