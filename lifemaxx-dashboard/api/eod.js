const NOTION_TOKEN = process.env.NOTION_TOKEN;
const EOD_DB = '322c4c26-9d19-8029-af7f-000bfafb8ae9';

async function notionQuery(databaseId, filter, sorts) {
  const body = { page_size: 50 };
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function getPageContent(pageId) {
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28'
    }
  });
  return res.json();
}

function extractNumber(text) {
  if (!text) return null;
  const match = text.match(/\b([0-9]|10)\b/);
  return match ? parseInt(match[1]) : null;
}

function extractText(blocks, targetHeading) {
  if (!blocks) return null;
  let capture = false;
  for (const block of blocks) {
    const type = block.type;
    const richText = block[type]?.rich_text || [];
    const text = richText.map(r => r.plain_text).join('').trim();

    if (type === 'heading_3' && text.toLowerCase().includes(targetHeading.toLowerCase())) {
      capture = true;
      continue;
    }
    if (capture && (type === 'heading_2' || type === 'heading_3' || type === 'divider')) break;
    if (capture && text) return text;
  }
  return null;
}

function parseEODBlocks(blocks) {
  const result = {};
  if (!blocks?.results) return result;
  const b = blocks.results;

  result.mood = extractNumber(extractText(b, 'How did I feel today'));
  result.performance = extractNumber(extractText(b, "Rate today's performance"));
  result.winsToday = extractText(b, 'What did I do really well');
  result.weighedOn = extractText(b, 'Did anything weigh on me');
  result.trained = extractText(b, 'What did I train today');
  result.bodyFeel = extractNumber(extractText(b, 'How did my body feel'));
  result.needleMover = extractText(b, 'pushed the needle forward');
  result.bottleneck = extractText(b, 'biggest bottleneck');
  result.tomorrow = extractText(b, 'Priority for tomorrow');

  // eating: look for "Did I eat right" answer
  const eatText = extractText(b, 'Did I eat right today');
  if (eatText) result.ateClean = eatText.toLowerCase().startsWith('yes');

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not set in environment variables' });
  }

  try {
    const data = await notionQuery(
      EOD_DB,
      null,
      [{ property: 'date', direction: 'ascending' }]
    );

    const entries = [];

    for (const page of (data.results || [])) {
      const props = page.properties;
      const dateVal = props?.date?.date?.start || null;
      const name = props?.Name?.title?.[0]?.plain_text || '';

      const blocks = await getPageContent(page.id);
      const parsed = parseEODBlocks(blocks);

      entries.push({
        id: page.id,
        name,
        date: dateVal,
        ...parsed
      });
    }

    return res.status(200).json({ entries, total: entries.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
