export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chiave API non configurata su Vercel.' });
  }

  // List of models to try in order
  const models = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b"
  ];

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`Provando analisi con modello: ${model}`);
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
      
      if (data.error) {
        // If it's a quota error or other retryable error, continue to next model
        console.warn(`Errore con ${model}:`, data.error.message);
        lastError = data.error.message;
        continue; 
      }

      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`Successo con modello: ${model}`);
        return res.status(200).json(parsed);
      } else {
        throw new Error("Formato risposta non valido.");
      }
    } catch (error) {
      console.error(`Catch errore con ${model}:`, error.message);
      lastError = error.message;
      // Continue to next model
    }
  }

  // If we reach here, all models failed
  return res.status(500).json({ error: `Tutti i modelli hanno fallito. Ultimo errore: ${lastError}` });
}
