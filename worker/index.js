// Cloudflare Worker - polishcv backend
// Handles: AI analysis, AI rewrite, PayPal order verification

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const AI_BASE_URL = 'https://breakout.wenwen-ai.com/v1';
const AI_MODEL = 'claude-sonnet-4-20250514';
const PAYPAL_API = 'https://api-m.paypal.com'; // live

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/analyze' && request.method === 'POST') {
        return await handleAnalyze(request, env);
      }
      if (url.pathname === '/api/rewrite' && request.method === 'POST') {
        return await handleRewrite(request, env);
      }
      if (url.pathname === '/api/verify-payment' && request.method === 'POST') {
        return await handleVerifyPayment(request, env);
      }
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

async function handleAnalyze(request, env) {
  const { resumeText, jobDescription } = await request.json();
  if (!resumeText) return jsonResponse({ error: 'Missing resume text' }, 400);

  const jdSection = jobDescription ? `\n\nTarget Job Description:\n${jobDescription}` : '';
  const prompt = `You are an expert resume consultant. Analyze the following resume and provide detailed optimization suggestions.${jdSection}

Resume:
${resumeText}

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "contentIssues": [{"issue": "<issue>", "suggestion": "<fix>"}],
  "formatIssues": [{"issue": "<issue>", "suggestion": "<fix>"}],
  "keywordsToAdd": ["<keyword>"],
  "strengths": ["<strength>"],
  "priorityFixes": ["<fix1>", "<fix2>", "<fix3>"]
}`;

  const aiResponse = await callAI(env.AI_API_KEY, prompt, 2000);
  const text = aiResponse.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return jsonResponse({ error: 'AI parse error' }, 500);
  return jsonResponse({ success: true, analysis: JSON.parse(jsonMatch[0]) });
}

async function handleRewrite(request, env) {
  const { resumeText, jobDescription, analysisNotes } = await request.json();
  if (!resumeText) return jsonResponse({ error: 'Missing resume text' }, 400);

  const jdSection = jobDescription ? `\n\nTarget Job Description:\n${jobDescription}` : '';
  const notesSection = analysisNotes ? `\n\nKey improvements to make:\n${analysisNotes}` : '';

  const prompt = `You are an expert resume writer. Rewrite the following resume to be more impactful, ATS-optimized, and professionally compelling.${jdSection}${notesSection}

Original Resume:
${resumeText}

Guidelines:
1. Quantify achievements with specific numbers/percentages where possible
2. Use strong action verbs at the start of bullet points
3. Remove redundant or weak phrases
4. Optimize for ATS keyword matching
5. Keep the same overall structure but improve every section
6. Make the professional summary compelling and specific
7. Ensure consistent formatting throughout

Return ONLY the rewritten resume text. No explanations. Use clear section headers and bullet points.`;

  const aiResponse = await callAI(env.AI_API_KEY, prompt, 4000);
  return jsonResponse({ success: true, rewrittenResume: aiResponse.choices[0].message.content });
}

async function handleVerifyPayment(request, env) {
  const { orderID } = await request.json();
  if (!orderID) return jsonResponse({ error: 'Missing orderID' }, 400);

  const tokenRes = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return jsonResponse({ error: 'PayPal auth failed' }, 500);

  const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  });
  const orderData = await orderRes.json();
  const verified = orderData.status === 'COMPLETED';
  return jsonResponse({ success: verified, verified });
}

async function callAI(apiKey, prompt, maxTokens = 2000) {
  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`AI API error: ${await res.text()}`);
  return res.json();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
