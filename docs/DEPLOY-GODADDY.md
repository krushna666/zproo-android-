# Publishing the static website on GoDaddy

The static website (`apps/web/dist`, or `zproo-go-static-site.zip`) needs only file hosting —
no Node.js, database or server code.

## Linux hosting (cPanel) — most GoDaddy plans

1. GoDaddy → **My Products** → **Web Hosting** → **Manage** → **cPanel Admin** → **File Manager**.
2. Open **public_html** (the folder for your main domain). Delete the default `index.html` /
   `default.html` / GoDaddy placeholder files if present.
3. **Upload** `zproo-go-static-site.zip` into `public_html`, then right-click it → **Extract**.
   The files (`index.html`, `app.html`, `.htaccess`, `assets/`, …) must sit directly in
   `public_html`, not in a sub-folder. Delete the zip afterwards.
4. In File Manager → **Settings**, tick **Show Hidden Files (dotfiles)** and check that
   `.htaccess` is there. It makes links such as `/buses` or `/flights/results` work when opened
   directly or refreshed.
5. Turn on HTTPS: cPanel → **SSL/TLS Status** (or GoDaddy → **SSL Certificates**) → run AutoSSL for
   the domain. Optionally force HTTPS in cPanel → **Domains** → **Force HTTPS Redirect**.
6. Open `https://your-domain` and try: search buses Pune → Mumbai, open a seat map, refresh the page.

## Windows hosting (Plesk)

Same as above, but upload into **httpdocs** with Plesk **File Manager**. `web.config` (included)
does the job of `.htaccess`; the IIS URL Rewrite module is enabled on GoDaddy Windows plans.

## Notes

- **Use the domain root or a sub-domain** (e.g. `demo.your-domain.com` → its own folder). A
  sub-folder like `your-domain.com/demo` does not work, because the site loads `/assets/…` from the
  root.
- **Updating:** rebuild (`npm run build -w @zproo/web`), then replace the files in `public_html`.
- **Optional SEO:** build with your address so the sitemap and share links use it:
  `VITE_SITE_URL=https://your-domain.com npm run build -w @zproo/web`.
- GoDaddy **Website Builder** / **Websites + Marketing** plans cannot host uploaded code — you need
  a **Web Hosting** (cPanel or Plesk) plan.
