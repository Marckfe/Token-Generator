export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: '[MTG-AI] Chiave API non configurata su Vercel.' });
  }

  // List of models to try. 1.5 Flash is more stable for free tier quotas.
  const models = [
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro"
  ];

  let lastError = "";

  for (const model of models) {
    try {
      const base64Data = image.split(',')[1];
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "ACT AS A PROFESSIONAL MTG CARD SCANNER. Identify every card in the image. Group identical cards by name and sum their quantities. For lands, count the stack accurately. Return ONLY a JSON array of objects. Example: [{\"name\":\"Island\",\"qty\":22},{\"name\":\"Opt\",\"qty\":4}]. DO NOT include comments or formatting markdown, just the raw JSON array." },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: {
            temperature: 0.1, // Lower temperature for more consistent/factual results
            topP: 0.95,
            topK: 40
          }
        })
      });

      const data = await response.json();
      
      if (data.error) {
        lastError = `${model}: ${data.error.message}`;
        console.warn(`[MTG-AI] Fallimento con ${model}: ${lastError}`);
        continue; 
      }

      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        let parsed = JSON.parse(jsonMatch[0]);
        // Defensive filtering: ensure name exists and is valid
        parsed = parsed.filter(item => item && item.name && typeof item.name === 'string' && item.name.length > 2);
        
        if (parsed.length > 0) {
          return res.status(200).json(parsed);
        } else {
          lastError = `${model}: Nessuna carta valida identificata dopo il filtraggio`;
          continue;
        }
      } else {
        lastError = `${model}: Risposta JSON non trovata o malformata`;
        continue;
      }
    } catch (error) {
      lastError = `${model}: ${error.message}`;
      continue;
    }
  }

  // If all models failed, return a structured error
  return res.status(500).json({ 
    error: `[MTG-AI] Tutti i modelli hanno fallito le quote. Ultimo errore: ${lastError}. Per favore riprova tra un minuto.` 
  });
}
