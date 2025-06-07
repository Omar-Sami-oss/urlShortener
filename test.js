const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Low, JSONFile } = require('lowdb');
const { nanoid } = require('nanoid');
const app = express();

// Set up lowdb
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

// Initialize database with default structure
async function initDb() {
  await db.read();
  db.data = db.data || { 
    users_table: [], 
    links_table: [] 
  };
  await db.write();
}
initDb();

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

// Serve static HTML files from the 'views' directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/notfound', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'notFound.html'));
});

app.get('/:urlCode', async (req, res) => {
  const urlCodePassed = String(req.params.urlCode);
  await db.read();
  const theLink = db.data.links_table.find(l => l.short_slug === urlCodePassed);

  if (theLink) {
    // Increment click_count
    theLink.click_count = (theLink.click_count || 0) + 1;
    await db.write();

    res.writeHead(301, { Location: String(theLink.original_url) });
    res.end();
  } else {
    res.redirect('/notfound');
  }
});

app.post('/', async (req, res) => {
  let url = req.body.url;

  if (!url.startsWith("http://") && !url.startsWith('https://')) {
    url = "http://" + String(url);
  }

  await db.read();
  const theLink = db.data.links_table.find(l => l.original_url === url);

  if (theLink) {
    // You can render a new HTML file or send a message
    res.send(`<p>Short URL: <a href="/${theLink.short_slug}">${req.headers.host}/${theLink.short_slug}</a></p>`);
  } else {
    // Generate unique short slug
    let text, exists;
    do {
      text = nanoid(5);
      exists = db.data.links_table.find(l => l.short_slug === text);
    } while (exists);

    const newLink = {
      id: nanoid(),
      original_url: url,
      short_slug: text,
      created_by: null, // Set user_id if available
      created_at: new Date().toISOString(),
      expires_at: null,
      click_count: 0,
      password_hash: null
    };

    db.data.links_table.push(newLink);
    await db.write();

    res.send(`<p>Short URL: <a href="/${text}">${req.headers.host}/${text}</a></p>`);
  }
});

app.listen(3000, () => {
  console.log('Server Started on port 3000');
});