const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const { nanoid } = require("nanoid");
const app = express();
const bcrypt = require("bcrypt");
const saltRounds = 10;
const QRCode = require('qrcode')

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "views")));
app.use(express.static(path.join(__dirname, "public")));

// Set up lowdb
const dbFile = path.join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const defaultData = { users_table: [], links_table: [] };
const db = new Low(adapter, defaultData);

async function initDb() {
  await db.read();
  await db.write();
}
initDb();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.post("/", (req, res) => {
  if (req.body.login) {
    return res.redirect("/login");
  } else if (req.body.register) {
    return res.redirect("/register");
  }
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

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/views/login.html");
});

app.post("/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const user = db.data.users_table.find(
    (user) => user.username === username
  );
  if (!user) {
    return res.status(400).send("User not found");
  } else {
    bcrypt.compare(password, user.hashed_password, function (err, result) {
      if (result) {
        // Password matches
        res.sendFile(__dirname + "/views/dashboard.html");
        
      } else {
        // Password does not match
        res.status(400).send("Invalid password");
      } 
    });
  }
});

app.get("/register", (req, res) => {
  res.sendFile(__dirname + "/views/register.html");
});

app.post("/register", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const userExists = db.data.users_table.find(
    (user) => user.username === username
  );
  if (userExists) {
    return res.status(400).send("User already exists");
  } else {
    bcrypt.hash(password, saltRounds, function (err, hash) {
      if (err) {
        return res.status(500).send("Error hashing password");
      }
      const newUser = {
        id: nanoid(),
        username,
        hashed_password: hash,
        created_at: new Date().toISOString(),
      };
      db.data.users_table.push(newUser);
      db.write()
        .then(() => {
          res.sendFile(__dirname + "/views/dashboard.html");
        })
        .catch(() => {
          res.status(500).send("Error saving user");
        });
    });
  }
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname + "/views/dashboard.html"));
});

app.post("/dashboard", async (req, res) => {
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
    res.send(`<p>QR Code: <img src="data:image/png;base64,${await QRCode.toDataURL(req.headers.host + '/' + text)}" alt="QR Code"></p>`);
  }
});

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
