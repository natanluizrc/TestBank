const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.gerarMaterial = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login necessário.');
    }

    const { texto, nomeArquivo } = data;
    if (!texto) {
      throw new functions.https.HttpsError('invalid-argument', 'Texto ausente.');
    }

    const apiKey = (functions.config().gemini || {}).key;
    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'Chave da API não configurada no servidor.');
    }

    const prompt = `Crie um material de estudo completo a partir do conteúdo abaixo. Retorne SOMENTE um objeto JSON válido, sem markdown, sem texto extra:
{
  "titulo": "Título descritivo do material",
  "secoes": [
    { "titulo": "Título da seção", "conteudo": "Conteúdo em prosa conversacional, sem listas com marcadores. Use **negrito** para termos-chave e \\n\\n para separar parágrafos." }
  ]
}
Escreva no mesmo idioma do material fonte. Mire em 5 a 8 seções. Seja didático e completo.

Fonte (${nomeArquivo}):
${texto.slice(0, 60000)}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          systemInstruction: {
            parts: [{ text: 'Você é um especialista em criação de material didático. Responda apenas com JSON válido, sem blocos de código markdown.' }]
          }
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new functions.https.HttpsError('internal', err.error?.message || `HTTP ${resp.status}`);
    }

    const result = await resp.json();
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      return JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new functions.https.HttpsError('internal', 'Resposta inválida da API');
    }
  });
