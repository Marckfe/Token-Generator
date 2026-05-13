export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chiave API non configurata su Vercel.' });
  }

  try {
    // Clean base64 string
    const base64Data = image.split(',')[1];
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
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
      throw new Error(data.error.message);
    }

    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json(parsed);
    } else {
      throw new Error("L'IA non ha restituito un formato valido.");
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
