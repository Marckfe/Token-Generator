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
              { text: "Identify EVERY MTG card in this image. For each unique card name, count the total quantity. Return ONLY a JSON array: [{\"name\":\"Card Name\",\"qty\":4}]." },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      
      // If we get a quota error (429) or other API errors, try the next model
      if (data.error) {
        lastError = `${model}: ${data.error.message}`;
        console.warn(`[MTG-AI] Fallimento con ${model}: ${lastError}`);
        continue; 
      }

      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json(parsed);
      } else {
        lastError = `${model}: Risposta JSON non trovata`;
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
