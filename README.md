# 🎄 Christmas Wish Lists

A small self-hosted wish-list site for Edwin and Erica. Each of you logs in to manage your own list. Anyone with the link can browse a list and claim gifts, and the list owner never sees what's been claimed.

- **Public pages:** `/` (one stocking per person), `/list/edwin`, `/list/erica`
- **Logged-in pages:** `/manage` (my list), `/planner` (gift planner), `/account`
- **Stack:** Node 22, Express 5, built-in `node:sqlite`, cheerio, vanilla JS. There's no build step.
- **Storage:** everything lives in one `/data` volume (`wishlist.db` and `images/`)

## Features

- **Magic add:** paste a product link. The server reads the name, price, photo and store from JSON-LD, Open Graph/product meta tags, Amazon's page markup, or, as a last resort, the page title. You get an editable preview before saving.
- **Product search:** Google Shopping results (with photos and prices) via [SerpApi](https://serpapi.com) when `SERPAPI_KEY` is set. Without a key, you get one-click searches on Amazon, Target, Walmart, Best Buy, Etsy and Google Shopping.
- **🎁 Bookmarklet** that opens `/add?url=<current page>`.
- **Manual add** with your own photo. Phone photos are resized in the browser before upload.
- **List management:** inline editing, drag-to-reorder (works with touch too), priority (★ Nice / ★★ Really want / ★★★ Dream gift), notes and quantity.
- **🔄 Refresh prices** re-checks every item and shows a 🔻 badge when a price drops.
- **Photos are saved locally** to `/data/images`, so they don't break when a store changes its links.
- **Archive** and **"Already got it"**: both hide the item from your public list.
- **Public list page:**
  - search, filters (price range, store, priority, unclaimed only) and sorting
  - a "Stocking stuffers under $25" row, item count and estimated total
  - copy-link and share buttons, plus Open Graph tags so shared links show a preview card
- **"I'll get this!" claims:**
  - Claims are hidden from the list owner.
  - Visitors can undo their claim from the same browser (a secret is kept in localStorage).
  - The two of you can always undo your own claims while logged in.
- **Gift planner:** everything you've claimed, your spend against a budget, and a wrapped/not-wrapped checklist.
- **Account page:** display name, a note for gift-givers, avatar emoji, theme, and password.

## Look & feel

- **Mobile-first** design. Fonts (Mountains of Christmas, Berkshire Swash and Nunito) are self-hosted in `public/static/fonts`, so nothing loads from Google.
- **Hero:** a night sky with twinkling stars, a moon, a snowy roofline with glowing windows, and string lights under the header. The lights twinkle in sequence; tap a bulb to pop it.
- **Flip-clock countdown** to Christmas. On December 25 it switches to "Merry Christmas!" with fireworks. Preview that with `/?date=2026-12-25`.
- **Gift cards:** paper texture, a corner ribbon with a bow, and a slight random tilt. Claimed gifts get a "🎅 Someone's on it!" stamp.
- **Home page:** one knitted stocking per person, hung on a garland mantel.
- **Animations:**
  - Canvas snowfall that piles up at the bottom of the screen.
  - Adding an item: a gift box drops in, its lid pops off and the item unfolds out.
  - Claiming: a burst of ornament and star confetti, then the stamp.
  - Deleting: the item crumples like wrapping paper and falls away.
- **Easter egg:** a sleigh flies across the sky every few minutes, or when someone types `santa`.
- **Floating buttons** (bottom right): ❄️ snow on/off, 🔔 sounds (muted by default; jingle bells, sleigh bells and pops are synthesised in the browser), and 🔥 the cozy **fireplace theme** (dark wood with a warm glow). Each visitor's choice is remembered in their browser. When logged in, the theme is also saved to your account.
- **Reduced motion:** if the device asks for it, there's no snow, confetti, sleigh flight or flipping. Everything uses simple fades.

## Fun extras

- **🧝 Elf mode** (on someone else's list): a spinning prize wheel picks a random *unclaimed* gift. The pick is made fairly from every unclaimed gift before the wheel spins; the wheel shows up to 12 of them, always including the winner. Then press "I'll get this!" to claim it.
- **📜 Santa's scroll** (`/scroll/edwin`, `/scroll/erica`): a printable parchment version of a list, with tick boxes, prices, notes, a wax seal and the list's link. Print straight from the browser; a typical list fits on one page. Gift-givers can tick "Only unclaimed" first.
- **🎄 Ornament tree** in the list page's hero: one ornament per claimed gift. The star lights up once everything is claimed.
- **🍬 Candy-cane progress bar:** "Erica's list is 60% claimed!" on each list page, with mini versions under the stockings on the home page.
- **No spoilers:** the list owner never sees their own claim count, ornaments, progress bar or Elf mode, and the API doesn't send those to them either.

## Quick start (on your VPS)

You need Docker with the compose plugin.

1. Copy the files to the server:

   ```bash
   scp -r christmas-wishlist you@your-vps:~/
   ```

2. On the VPS, create your `.env` from the example:

   ```bash
   cd ~/christmas-wishlist
   ```

   ```bash
   cp .env.example .env
   ```

3. Edit `.env`. At minimum, set the passwords in `SEED_USERS`, for example:

   ```
   SEED_USERS=edwin:Edwin:a-good-password;erica:Erica:another-good-password
   ```

4. Start it:

   ```bash
   docker compose up -d --build
   ```

5. Check that it came up:

   ```bash
   docker compose logs -f
   ```

The app listens on `127.0.0.1:3000`, so only the VPS itself can reach it. Put Caddy or nginx in front of it for HTTPS (see below).

`SEED_USERS` is only read on start-up, and only creates users that don't exist yet. Changing a password in `.env` later does nothing. Use the Account page or the CLI instead.

### Managing users from the command line

List users:

```bash
docker compose exec wishlist npm run user -- list
```

Reset a password (this also logs that user out everywhere):

```bash
docker compose exec wishlist npm run user -- reset-password erica 'new-password-here'
```

Add another user (their list will be at `/list/grandma`):

```bash
docker compose exec wishlist npm run user -- add grandma "Grandma" 'her-password'
```

Remove a user and their list:

```bash
docker compose exec wishlist npm run user -- remove grandma
```

## HTTPS with Caddy (recommended)

Caddy gets and renews Let's Encrypt certificates automatically. Point a DNS record (for example `wishlist.example.com`) at your VPS, then add this to `/etc/caddy/Caddyfile`:

```
wishlist.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Then set `COOKIE_SECURE=true` in `.env` and restart the app:

```bash
docker compose up -d
```

### Caddy in Docker instead

If you'd rather run Caddy as a container, put both services on one network. Remove the `ports:` from `wishlist` and add this to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
```

Use `reverse_proxy wishlist:3000` in that Caddyfile, and add `caddy-data:` under `volumes:`.

### nginx alternative

```nginx
server {
    listen 80;
    server_name wishlist.example.com;
    client_max_body_size 12m;   # photo uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add HTTPS with certbot:

```bash
sudo certbot --nginx -d wishlist.example.com
```

Then set `COOKIE_SECURE=true` in `.env`.

## Bookmarklet

Log in and open **My List**. At the bottom, drag the **🎁 Add to Wish List** button to your browser's bookmarks bar. On any product page, click it and the page opens in your list's magic-add preview.

On a phone, bookmark any page, edit the bookmark, and paste the code shown under "On a phone?". Or use the browser's Share → Copy link and paste the link into the "Paste a link" box. Pasting a link fetches the details straight away.

## Product search (optional)

1. Sign up at [serpapi.com](https://serpapi.com). The free tier covers a few hundred searches a month.
2. Put your key in `.env`:

   ```
   SERPAPI_KEY=...
   ```

3. Restart:

   ```bash
   docker compose up -d
   ```

Results are cached for 6 hours to save quota.

## Backups

Everything is in the `wishlist-data` Docker volume.

Make a backup (writes `wishlist-backup-YYYY-MM-DD.tgz` in the current folder):

```bash
docker run --rm -v christmas-wishlist_wishlist-data:/data -v "$PWD":/backup alpine tar czf /backup/wishlist-backup-$(date +%F).tgz -C /data .
```

Restore a backup (stop the app first):

```bash
docker compose down
```

```bash
docker run --rm -v christmas-wishlist_wishlist-data:/data -v "$PWD":/backup alpine sh -c "cd /data && tar xzf /backup/wishlist-backup-2026-12-01.tgz"
```

```bash
docker compose up -d
```

The volume name is prefixed with the project folder name. Check it with:

```bash
docker volume ls
```

For a nightly backup, add the backup command to `crontab -e`, for example `15 3 * * * cd ~/christmas-wishlist && <backup command>`. In crontab, `%` must be written as `\%`.

## Updating

```bash
cd ~/christmas-wishlist
```

```bash
docker compose up -d --build
```

The database schema is created automatically on start-up.

## Configuration (`.env`)

| Variable | Default | What it does |
| --- | --- | --- |
| `SEED_USERS` | — | `user:Name:password;user2:Name2:password2`, created on first start |
| `SITE_TITLE` | Our Christmas Wish Lists | Site name |
| `COOKIE_SECURE` | `false` | Set to `true` once served over HTTPS |
| `TRUST_PROXY` | `true` | Trust `X-Forwarded-*` from your reverse proxy |
| `SERPAPI_KEY` | — | Enables in-app Google Shopping search |
| `SEARCH_COUNTRY` | `us` | Country for search results |
| `DEFAULT_CURRENCY` | `USD` | Used when a page shows a price without a currency |
| `SESSION_DAYS` | `30` | How long logins last |
| `ALLOW_PRIVATE_FETCH` | `false` | Lets the link fetcher reach LAN/private IPs. Leave off. |

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` when `COOKIE_SECURE=true`).
- Logins are rate-limited (10 attempts per 15 minutes per IP). Claims and link fetching are rate-limited too.
- The API only accepts JSON for changes, so other websites can't forge form posts (CSRF).
- The link fetcher:
  - only allows `http`/`https`
  - blocks private, loopback and link-local addresses, re-checking on every redirect
  - times out after 12 seconds and caps pages at 4 MB and images at 8 MB
- Uploaded photos are checked by their file contents (JPEG, PNG, WebP or GIF) and stored under a hash of their contents.
- All user content is escaped before it's rendered.

## Note on store blocking

Some stores (Amazon especially) occasionally serve a bot check instead of the product page. When that happens, the preview says so and you can fill in the details by hand, or try again later. Prices that a store only loads with JavaScript after the page opens can't be read. The photo and title usually still come through.

## Local development

```bash
npm install
```

```bash
SEED_USERS='edwin:Edwin:candycane123;erica:Erica:mistletoe123' npm run dev
```

Then open http://localhost:3000.
