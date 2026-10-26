# The Girls' Directory — setup guide

A live website for the group directory. People can browse, search, filter by category or by Girl Business / Recommendation, and add new entries. Everything is stored in the existing Google Sheet, so you can still edit and moderate there.

**What's in this folder**

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The website (goes on GitHub) |
| `apps-script/Code.gs` | The connector between the website and the Google Sheet |

You can open `index.html` in a browser right now to preview the site with made-up sample listings.

---

## Step 1 — Connect the Google Sheet (about 5 min)

You need **edit access** to the sheet for this.

1. Open the directory Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete the code that's there, paste in everything from `apps-script/Code.gs`, and click **Save** (the disk icon).
4. Click **Deploy → New deployment**.
5. Click the gear next to "Select type" and choose **Web app**.
6. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy**. Google will ask you to authorise: choose your account. If you see "Google hasn't verified this app", click **Advanced → Go to (project name)** — this is normal for your own scripts.
8. Copy the **Web app URL** (it ends in `/exec`).

## Step 2 — Put the URL in the website (1 min)

Open `app.js` and paste the URL between the quotes on this line near the top:

```js
const API_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

## Step 3 — Publish on GitHub Pages (about 5 min)

1. Sign in to github.com and click **New repository**. Name it e.g. `girls-directory`. It must be **Public** for free GitHub Pages. Click **Create repository**.
2. Click **uploading an existing file**, drag in `index.html`, `styles.css` and `app.js`, then click **Commit changes**.
3. Go to **Settings → Pages**. Under "Branch", choose **main** and **/ (root)**, then **Save**.
4. After a minute, your site is live at `https://YOUR-USERNAME.github.io/girls-directory/`. Share that link with the group.

---

## How the sheet is read

- **Every tab is a category** (the tab name is what people see), except tabs with "read me" in the name. Hidden tabs are skipped.
- In each tab, the header row is the one containing **Business name**. Columns are matched by header, so order doesn't matter: Business name, Brief, Classification, Tags, Website, Phone, Email.
- **To add a new category:** add a new tab with the same headers. It appears on the site automatically.
- **To remove or fix an entry:** edit or delete the row in the sheet. The site picks up changes within about 2 minutes.
- New entries from the website go into the first empty row under the existing ones.

**Tidy-up tip:** in the Beauty and Wellness tab, the phone column's header shows a phone number instead of "Phone". The site handles it, but renaming the header to **Phone** keeps things clear.

## Optional — members-only passcode

GitHub Pages sites are public, so anyone who finds the link can see the contacts. To keep it to the group:

1. In Apps Script, go to **Project Settings (gear) → Script properties → Add script property**.
2. Property: `PASSCODE`, value: whatever you choose. Save.

The site will ask for the passcode once per device. Share it in the group chat. To change it, edit the property; everyone will be asked again.

## Updating the script later

If you change `Code.gs`, go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same, so the website doesn't need changing.

## Using your own domain (optional)

In GitHub **Settings → Pages → Custom domain**, enter your domain and follow GitHub's instructions for the DNS record.
