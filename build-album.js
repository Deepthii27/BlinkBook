// Scans IMAGES/<album-folder>/ (or "photos/") and writes trips.json.  Run:  node build-album.js
// Netlify runs this automatically on every deploy (see netlify.toml).
const fs = require("fs");
const path = require("path");

// Finds the photos folder whatever its capitalisation: IMAGES, Images, photos ...
const rootName = fs.readdirSync(__dirname, { withFileTypes: true })
  .find((d) => d.isDirectory() && ["images", "photos"].includes(d.name.toLowerCase()));
const ROOT = rootName ? path.join(__dirname, rootName.name) : null;
const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;
const pretty = (s) => s.replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (d) => new Date(d + "T00:00").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

const trips = [];
if (ROOT) {
  for (const dir of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const folder = path.join(ROOT, dir.name);
    const files = fs.readdirSync(folder).filter((f) => IMG.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!files.length) continue;

    let info = {};
    const infoPath = path.join(folder, "info.json");
    if (fs.existsSync(infoPath)) {
      try { info = JSON.parse(fs.readFileSync(infoPath, "utf8")); }
      catch (e) { console.warn(`Skipping bad info.json in "${dir.name}": ${e.message}`); }
    }

    // Folder names like 2026-03-goa-trip give a title and a month automatically.
    const m = dir.name.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?[-_ ]*(.*)$/);
    const src = (f) => `${encodeURIComponent(rootName.name)}/${encodeURIComponent(dir.name)}/${encodeURIComponent(f)}`;
    let when = "";
    if (info.start && info.end && info.start !== info.end) when = `${fmt(info.start)} to ${fmt(info.end)}`;
    else if (info.start) when = fmt(info.start);
    else if (m) when = new Date(+m[1], +m[2] - 1, 1).toLocaleDateString("en", { month: "short", year: "numeric" });

    trips.push({
      id: dir.name.toLowerCase().replace(/\s+/g, "-"), // matches the ids in app.js
      title: info.title || pretty(m && m[4] ? m[4] : dir.name),
      place: info.place || "",
      when,
      sort: info.start || (m ? `${m[1]}-${m[2]}-${m[3] || "01"}` : ""),
      cover: src(info.cover && files.includes(info.cover) ? info.cover : files[0]),
      photos: files.map((f) => ({ src: src(f), caption: (info.captions || {})[f] || "" })),
    });
  }
}
trips.sort((a, b) => b.sort.localeCompare(a.sort));
fs.writeFileSync(path.join(__dirname, "trips.json"), JSON.stringify(trips, null, 2));
console.log(`Album built: ${trips.length} trip(s), ${trips.reduce((n, t) => n + t.photos.length, 0)} photo(s).`);