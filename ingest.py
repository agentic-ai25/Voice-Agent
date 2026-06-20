"""
One-time website scrape -> site_index.json

Run:  python ingest.py            (uses SITE_URL from .env)
      python ingest.py https://acme.com --max-pages 30

Strategy:
  * Plain-Python BFS crawl (httpx + BeautifulSoup) to FETCH pages cheaply and
    reliably -- the LLM is NOT used to "crawl".
  * A small classifier Agent labels each page (pricing/blog/product/contact/...)
    and writes a one-line summary, so the runtime agent can redirect intelligently.
The result is a static context file the chat runtime reads. Re-run on a schedule
to refresh.
"""
import asyncio
import json
import os
import sys
from collections import deque
from urllib.parse import urljoin, urldefrag, urlparse

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pydantic import BaseModel
from agents import Agent, Runner

load_dotenv()

USER_AGENT = "Mozilla/5.0 (compatible; SiteIndexBot/1.0)"


class PageLabel(BaseModel):
    page_type: str  # pricing | blog | product | about | contact | docs | home | other
    summary: str    # one or two sentences


classifier = Agent(
    name="Page Classifier",
    instructions=(
        "You are given a web page's title and visible text. Classify the page "
        "into one of: pricing, blog, product, about, contact, docs, home, other. "
        "Choose 'pricing' only for the main plans/pricing page, 'contact' for "
        "contact/demo/book-a-call pages. Write a one-sentence summary a chat "
        "assistant could use to decide whether to send a visitor here."
    ),
    output_type=PageLabel,
)


def same_site(seed: str, url: str) -> bool:
    return urlparse(seed).netloc == urlparse(url).netloc


def clean(url: str) -> str:
    return urldefrag(url)[0].rstrip("/")


def fetch(url: str) -> tuple[str, str, list[tuple[str, str]], list[dict]]:
    """Return (title, visible_text, links, forms) for a page."""
    r = httpx.get(url, timeout=20, follow_redirects=True,
                  headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    title = (soup.title.string or "").strip() if soup.title else ""
    text = soup.get_text(" ", strip=True)
    links = []
    for a in soup.find_all("a", href=True):
        href = clean(urljoin(url, a["href"]))
        if href.startswith("http"):
            links.append((a.get_text(strip=True)[:60], href))
    forms = []
    for f in soup.find_all("form"):
        fields = [i.get("name") for i in f.find_all(("input", "textarea", "select"))
                  if i.get("name")]
        forms.append({"action": clean(urljoin(url, f.get("action", url))),
                      "fields": fields})
    return title, text, links, forms


async def main():
    seed = clean(sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http")
                 else os.environ["SITE_URL"])
    max_pages = 25
    if "--max-pages" in sys.argv:
        max_pages = int(sys.argv[sys.argv.index("--max-pages") + 1])

    print(f"Crawling {seed} (max {max_pages} pages)...")
    seen, queue, pages = set(), deque([seed]), []

    while queue and len(pages) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            title, text, links, forms = fetch(url)
        except Exception as e:  # noqa: BLE001 - best-effort crawl
            print(f"  skip {url}: {e}")
            continue

        label = await Runner.run(
            classifier,
            f"URL: {url}\nTITLE: {title}\nTEXT: {text[:4000]}",
        )
        lab: PageLabel = label.final_output
        pages.append({
            "url": url,
            "title": title,
            "page_type": lab.page_type,
            "summary": lab.summary,
            # keep a trimmed text blob so the runtime can answer questions
            "content": text[:3000],
            "key_links": [{"label": l, "url": u} for l, u in links[:15]],
            "forms": forms,
        })
        print(f"  [{lab.page_type:8}] {url}")

        for _, href in links:
            if same_site(seed, href) and href not in seen:
                queue.append(href)

    index = {"seed": seed, "page_count": len(pages), "pages": pages}
    with open("site_index.json", "w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=2, ensure_ascii=False)
    print(f"\nWrote site_index.json with {len(pages)} pages.")


if __name__ == "__main__":
    asyncio.run(main())
