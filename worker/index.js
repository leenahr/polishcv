// Cloudflare Worker - polishcv backend
// Handles: AI analysis, AI rewrite, PayPal order verification

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const AI_BASE_URL = 'https://breakout.wenwen-ai.com/v1';
const AI_MODEL = 'claude-sonnet-4-6';
const PAYPAL_API = 'https://api-m.sandbox.paypal.com'; // sandbox for testing
// const PAYPAL_API = 'https://api-m.paypal.com'; // live (uncomment when going live)

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

Respond ONLY with valid JSON. No markdown, no code blocks, no explanations. Use double quotes for all strings. Do not include newlines inside string values. Strictly follow this format:
{
  "overallScore": <number 0-100>,
  "summary": "<one paragraph assessment, no newlines>",
  "contentIssues": [{"issue": "<text>", "suggestion": "<text>"}],
  "formatIssues": [{"issue": "<text>", "suggestion": "<text>"}],
  "keywordsToAdd": ["<keyword>"],
  "strengths": ["<strength>"],
  "priorityFixes": ["<fix1>", "<fix2>", "<fix3>"]
}`;

  const aiResponse = await callAI(env.AI_API_KEY, prompt, 3000);
  const text = aiResponse.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return jsonResponse({ error: 'AI parse error: no JSON found' }, 500);

  // Robust JSON parse with fallback sanitization
  let analysis;
  try {
    analysis = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Try to sanitize: remove control characters and re-parse
    try {
      const sanitized = jsonMatch[0]
        .replace(/[\x00-\x1F\x7F]/g, ' ')  // remove control chars
        .replace(/,\s*([\]}])/g, '$1')       // remove trailing commas
        .replace(/(["\w])\s*\n\s*/g, '$1 '); // flatten newlines inside strings
      analysis = JSON.parse(sanitized);
    } catch (e2) {
      // Last resort: return a minimal valid structure
      analysis = {
        overallScore: 65,
        summary: text.slice(0, 300),
        contentIssues: [],
        formatIssues: [],
        keywordsToAdd: [],
        strengths: [],
        priorityFixes: ['Please review the full analysis in the summary above.']
      };
    }
  }
  return jsonResponse({ success: true, analysis });
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

IMPORTANT FORMATTING RULES:
- Do NOT use Markdown syntax. No #, ##, **, *, --, |, or backticks.
- Write the person's name on the first line as plain text (e.g. "JOHN SMITH")
- Write their title/role on the second line as plain text
- Write contact info on the third line separated by spaces (e.g. "john@email.com  New York, NY  linkedin.com/in/john")
- Use ALL CAPS for section headers (e.g. "PROFESSIONAL SUMMARY", "WORK EXPERIENCE", "EDUCATION", "SKILLS")
- Use bullet points with "•" character for job responsibilities and achievements
- Use plain text only. No special characters for formatting.

Return ONLY the rewritten resume text. No explanations, no preamble.`;

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
