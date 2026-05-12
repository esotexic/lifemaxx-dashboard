const NOTION_TOKEN = process.env.NOTION_TOKEN;
const TODO_DB = '322c4c269d19804dbeb3ee977c0440df';

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
      sorts: [{ property: 'Date', direction: 'ascending' }]
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not set' });

  try {
    const data = await notionQuery(TODO_DB);
    if (data.object === 'error') return res.status(500).json({ error: data.message });

    const pages = [];
    let totalTasks = 0, doneTasks = 0;

    for (const page of (data.results || [])) {
      const props = page.properties;
      const dateVal = props?.Date?.date?.start || null;
      const status = props?.Status?.status?.name || null;
      const blocks = await getPageBlocks(page.id);

      let total = 0, done = 0;
      for (const block of blocks) {
        if (block.type === 'to_do') {
          total++;
          if (block.to_do?.checked) done++;
        }
      }

      totalTasks += total;
      doneTasks += done;
      pages.push({ id: page.id, date: dateVal, status, total, done });
    }

    return res.status(200).json({ pages, totalTasks, doneTasks });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
