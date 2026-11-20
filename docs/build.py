from pathlib import Path

ROOT = Path(__file__).resolve().parent

template = (ROOT / "index.template.html").read_text()
css = (ROOT / "styles.css").read_text()
js = (ROOT / "app.js").read_text()

if "<!-- JYNEX_STYLES -->" not in template or "<!-- JYNEX_SCRIPT -->" not in template:
    raise SystemExit("Build template is missing a Jynex insertion marker.")

page = template.replace("<!-- JYNEX_STYLES -->", f"<style>\n{css}\n  </style>")
page = page.replace("<!-- JYNEX_SCRIPT -->", f"  <script type=\"module\">\n{js}\n  </script>")
(ROOT / "index.html").write_text(page)
print("Built Jynex from docs sources: docs/index.html")
