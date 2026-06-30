// /api/post — Vercel Serverless Function
//
// Purpose: give every "مساحتك" wall post its own shareable link that shows
// a real preview (title + author + image) when pasted into WhatsApp,
// Telegram, etc. Those apps' link-crawlers only read the raw HTML <head>
// they get back from the URL — they never run JavaScript — so a normal
// single-page app (whose HTML is identical for every URL) can't do this on
// its own. This function fills that one gap: it fetches just the
// requested post from Firestore, returns a tiny HTML page with that post's
// own <meta property="og:..."> tags, and immediately sends a real human
// visitor on into the live app with that exact post highlighted.
//
// This only runs on the Vercel deployment (asaas-calendar-2026.vercel.app).
// A plain static host (e.g. GitHub Pages) has no server to run this kind
// of function on, so per-post previews aren't possible there — every
// shared link would just show the site's one generic preview instead.

const PROJECT_ID = 'asaas-calendar';
const API_KEY    = 'AIzaSyBzV9l4Y6X8RyjoNFIrLUTyT1KeDjMnVAw'; // same public Web API key already shipped in index.html — restricted by Firestore Security Rules, not a secret
const SITE_URL   = 'https://asaas-calendar-2026.vercel.app';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`; // optional — falls back gracefully if this file doesn't exist

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Firestore REST documents use typed wrapper objects ({ stringValue, integerValue, ... }).
// This just unwraps the handful of types this doc actually uses.
function unwrapValue(v) {
  if (!v) return null;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue'  in v) return Number(v.integerValue);
  if ('doubleValue'   in v) return v.doubleValue;
  if ('booleanValue'  in v) return v.booleanValue;
  if ('arrayValue'    in v) return (v.arrayValue.values || []).map(unwrapValue);
  if ('mapValue'      in v) return unwrapFields(v.mapValue.fields || {});
  if ('nullValue'     in v) return null;
  return null;
}
function unwrapFields(fields) {
  const out = {};
  for (const key in fields) out[key] = unwrapValue(fields[key]);
  return out;
}

function truncate(s, n) {
  s = String(s || '').trim();
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
}

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) ? String(req.query.id) : '';

  let title = 'مساحتك — تقويم أساس المؤسسي 2026';
  let description = 'شارك مقولة، فائدة، فكرة، أو رأي قصير مع الفريق.';
  let image = DEFAULT_IMAGE;
  let redirectUrl = `${SITE_URL}/`;

  try {
    if (id) {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/calendar/masahatak?key=${API_KEY}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const entries = unwrapValue(data.fields && data.fields.entries) || [];
        const post = entries.find(e => e && e.id === id);
        if (post) {
          const author = post.name ? post.name : 'مجهول';
          if (post.text) {
            title = truncate(post.text, 70);
            description = `بقلم ${author} · مساحتك`;
          } else {
            title = `مشاركة من ${author}`;
            description = 'مساحتك — تقويم أساس المؤسسي 2026';
          }
          if (post.image) image = post.image;
          redirectUrl = `${SITE_URL}/?post=${encodeURIComponent(id)}#masahatak`;
        }
      }
    }
  } catch (err) {
    console.error('[api/post] lookup failed:', err);
    // Falls through to the generic site preview/redirect below — a broken
    // lookup should never leave the visitor on a dead page.
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta property="og:type" content="article" />
<meta property="og:site_name" content="تقويم أساس المؤسسي 2026" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:url" content="${esc(redirectUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0; url=${esc(redirectUrl)}" />
<script>location.replace(${JSON.stringify(redirectUrl)});</script>
</head>
<body style="font-family:sans-serif;text-align:center;padding:40px;color:#555">
  <p>جارٍ التحويل إلى المشاركة…</p>
  <p><a href="${esc(redirectUrl)}">اضغط هنا إذا لم يتم التحويل تلقائيًا</a></p>
</body>
</html>`);
};
