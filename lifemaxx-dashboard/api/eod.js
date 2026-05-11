const NOTION_TOKEN = process.env.NOTION_TOKEN;
const EOD_DB = '322c4c269d1980b2acf7db3becb7ae44';

async function notionQuery(databaseId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      page_size: 50,
      sorts: [{ property: 'date', direction: 'ascending' }]
    })
  });
  return res.json();
}

async function getPageBlocks(pageId) {
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28'
    }
  });
  const data = await res.json();
  return data.results || [];
}

function blockText(block) {
  const type = block.type;
  const rich = block[type]?.rich_text || [];
  return rich.map(r => r.plain_text).join('').trim();
}

function extractAfterHeading(blocks, keyword) {
  let capture = false;
  for (const block of blocks) {
    const type = block.type;
    const text = blockText(block);
    if ((type === 'heading_3' || type === 'heading_2') && text.toLowerCase().includes(keyword.toLowerCase())) {
      capture = true;
      continue;
    }
    if (capture && (type === 'heading_2' || type === 'heading_3' || type === 'divider')) break;
    if (capture && text) return text;
  }
  return null;
}

function extractNumber(text) {
  if (!text) return null;
  const match = text.match(/\b(10|[1-9])\b/);
  return match ? parseInt(match[1]) : null;
}

function parseBlocks(blocks) {
  const result = {};
  result.mood = extractNumber(extractAfterHeading(blocks, 'feel today'));
  result.performance = extractNumber(extractAfterHeading(blocks, "today's performance"));
  result.winsToday = extractAfterHeading(blocks, 'really well today');
  result.weighedOn = extractAfterHeading(blocks, 'weigh on me');
  result.trained = extractAfterHeading(blocks, 'train today');
  result.bodyFeel = extractNumber(extractAfterHeading(blocks, 'body feel today'));
  result.needleMover = extractAfterHeading(blocks, 'needle forward');
  result.bottleneck = extractAfterHeading(blocks, 'bottleneck');
  result.tomorrow = extractAfterHeading(blocks, 'Priority for tomorrow');
  const eatText = extractAfterHeading(blocks, 'eat right today');
  result.ateClean = eatText ? eatText.toLowerCase().startsWith('yes') : false;
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not set' });
  try {
    const data = await notionQuery(EOD_DB);
    if (data.object === 'error') return res.status(500).json({ error: data.message });
    const entries = [];
    for (const page of (data.results || [])) {
      const props = page.properties;
      const dateVal = props?.date?.date?.start || null;
      const name = props?.Name?.title?.[0]?.plain_text || '';
      const blocks = await getPageBlocks(page.id);
      const parsed = parseBlocks(blocks);
      entries.push({ id: page.id, name, date: dateVal, ...parsed });
    }
    return res.status(200).json({ entries, total: entries.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
