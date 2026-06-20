"""
FastAPI backend for the chat widget.

  POST /chat   { "visitor_id": "...", "message": "..." }
               -> { "reply": "...", "actions": [ {action:redirect|schedule|...} ] }
  GET  /       -> serves the demo widget (static/index.html)

Per-visitor memory is handled by the Agents SDK SQLiteSession, keyed on
visitor_id, so the conversation persists across requests.

Run:  uvicorn server:app --reload --port 8000
"""
import asyncio
import os
import json
from collections import deque
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from agents import Runner, SQLiteSession
from agents.items import ToolCallOutputItem

from app_agents import triage_agent, PAGES, current_site_pages
from ingest import fetch, classifier, same_site, clean, PageLabel

app = FastAPI(title="Website Chat Agent")

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(
    os.environ.get(
        "DATA_DIR",
        "/tmp/voice-agent-data" if os.environ.get("VERCEL") else str(BASE_DIR),
    )
)
RUNTIME_INDICES_DIR = DATA_DIR / "indices"
BUNDLED_INDICES_DIR = BASE_DIR / "indices"
DB_PATH = DATA_DIR / "conversations.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
RUNTIME_INDICES_DIR.mkdir(parents=True, exist_ok=True)

# Allow the Next.js demo site (localhost:3000) to call this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow any site origin to connect dynamically
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    visitor_id: str
    message: str
    current_url: str | None = None


def extract_actions(result) -> list[dict]:
    """Pull structured UI actions (redirect/schedule/form_submitted) out of the
    tool outputs the agent produced this turn."""
    actions = []
    for item in result.new_items:
        if isinstance(item, ToolCallOutputItem):
            out = item.output
            if isinstance(out, dict) and out.get("action") not in (None, "none"):
                actions.append(out)
    return actions


active_crawls = set()


def load_index(origin_key: str) -> dict | None:
    for index_path in (
        RUNTIME_INDICES_DIR / f"{origin_key}.json",
        BUNDLED_INDICES_DIR / f"{origin_key}.json",
    ):
        if index_path.exists():
            with index_path.open(encoding="utf-8") as fh:
                return json.load(fh)
    return None


async def run_background_crawl(seed: str, origin_key: str):
    if origin_key in active_crawls:
        return
    active_crawls.add(origin_key)
    try:
        max_pages = 15
        print(f"Starting background crawl for {seed}...")
        seen, queue, pages = set(), deque([seed]), []
        
        while queue and len(pages) < max_pages:
            url = queue.popleft()
            if url in seen:
                continue
            seen.add(url)
            try:
                title, text, links, forms = await asyncio.to_thread(fetch, url)
            except Exception as e:
                print(f"Background crawl skip {url}: {e}")
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
                "content": text[:3000],
                "key_links": [{"label": l, "url": u} for l, u in links[:15]],
                "forms": forms,
            })
            
            for _, href in links:
                if same_site(seed, href) and href not in seen:
                    queue.append(href)
                    
        index = {"seed": seed, "page_count": len(pages), "pages": pages}
        index_path = RUNTIME_INDICES_DIR / f"{origin_key}.json"
        with index_path.open("w", encoding="utf-8") as fh:
            json.dump(index, fh, indent=2, ensure_ascii=False)
        print(f"Background crawl complete for {seed}. Wrote {index_path}")
    except Exception as e:
        print(f"Background crawl error for {seed}: {e}")
    finally:
        active_crawls.discard(origin_key)


def get_programmatic_redirect(msg: str, pages: list[dict]) -> dict | None:
    msg_lower = msg.lower()
    
    # Map common synonyms to exact index page_types
    mapping = {
        "price": "pricing",
        "prices": "pricing",
        "pricing": "pricing",
        "cost": "pricing",
        "plans": "pricing",
        
        "features": "product",
        "feature": "product",
        "integrations": "product",
        "integration": "product",
        "product": "product",
        "workflow": "product",
        "workflows": "product",
        
        "about": "about",
        "team": "about",
        "values": "about",
        "founders": "about",
        
        "blog": "blog",
        "post": "blog",
        "posts": "blog",
        "article": "blog",
        "articles": "blog",
        
        "contact": "contact",
        "demo": "contact",
        "book": "contact",
        "meeting": "contact",
        "email": "contact",
        
        "home": "home",
        "homepage": "home",
        "start": "home"
    }
    
    # Find matching keyword
    matched_intent = None
    for kw, intent in mapping.items():
        if kw in msg_lower:
            matched_intent = intent
            break
            
    if not matched_intent:
        return None
        
    page = next((p for p in pages if p["page_type"] == matched_intent), None)
    if not page:
        page = next((p for p in pages if matched_intent in p["page_type"].lower()), None)
    if not page:
        page = next((p for p in pages if matched_intent in p["title"].lower()), None)
        
    if page:
        return {
            "action": "redirect",
            "url": page["url"],
            "label": page["title"]
        }
    return None


@app.post("/chat")
async def chat(req: ChatRequest):
    session = SQLiteSession(req.visitor_id, str(DB_PATH))
    
    # 1. Resolve site origin and load pages list
    current_url = req.current_url or "http://localhost:3000"
    try:
        parsed = urlparse(current_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        origin_key = parsed.netloc.replace(":", "_").replace(".", "_")
    except Exception:
        origin = "http://localhost:3000"
        origin_key = "localhost_3000"
        
    site_index = load_index(origin_key)

    if site_index:
        pages = site_index["pages"]
    else:
        # Start background crawl task
        asyncio.create_task(run_background_crawl(origin, origin_key))
        
        # Scrape current page synchronously so the agent has immediate context
        pages = []
        try:
            title, text, links, forms = await asyncio.to_thread(fetch, current_url)
            label = await Runner.run(
                classifier,
                f"URL: {current_url}\nTITLE: {title}\nTEXT: {text[:4000]}",
            )
            lab: PageLabel = label.final_output
            pages.append({
                "url": current_url,
                "title": title,
                "page_type": lab.page_type,
                "summary": lab.summary,
                "content": text[:3000],
                "key_links": [{"label": l, "url": u} for l, u in links[:15]],
                "forms": forms,
            })
        except Exception as e:
            print(f"Failed synchronous fetch of {current_url}: {e}")
            pages = PAGES # Fallback to default index pages
            
    # Set the thread-safe request-scoped ContextVar
    current_site_pages.set(pages)
    
    # Programmatic enforcement to guarantee gpt-4o-mini triggers tool redirection
    msg_lower = req.message.lower()
    directed_message = req.message
    
    # Check if user explicitly wants to perform the action in chat (booking or form submission)
    is_chat_booking_or_form = any(k in msg_lower for k in ["book", "schedule", "fill", "submit", "chat", "here", "directly"])
    
    if any(k in msg_lower for k in ["price", "pricing", "cost", "plans"]):
        directed_message = "[SYSTEM CONSTRAINT: You MUST call get_redirect_url('pricing') immediately. You must outline the pricing details from the page_details returned by the tool and explain that you are redirecting them to the pricing page in your text response.] " + req.message
    elif any(k in msg_lower for k in ["feature", "product", "workflow", "integration"]):
        directed_message = "[SYSTEM CONSTRAINT: You MUST call get_redirect_url('product') immediately. You must explain the key features from the page_details returned by the tool and explain that you are redirecting them to the product page in your text response.] " + req.message
    elif any(k in msg_lower for k in ["blog", "article", "post"]):
        directed_message = "[SYSTEM CONSTRAINT: You MUST call get_redirect_url('blog') immediately. You must list the blog articles from the page_details returned by the tool and explain that you are redirecting them to the blog page in your text response.] " + req.message
    elif any(k in msg_lower for k in ["contact", "email", "meeting", "demo"]) and not is_chat_booking_or_form:
        directed_message = "[SYSTEM CONSTRAINT: You MUST call get_redirect_url('contact') immediately. You must explain how to contact us or book a demo from the page_details returned by the tool, and explain that you are redirecting them to the contact page in your text response.] " + req.message
    elif any(k in msg_lower for k in ["about", "team", "values", "founder"]):
        directed_message = "[SYSTEM CONSTRAINT: You MUST call get_redirect_url('about') immediately. You must summarize our mission and values from the page_details returned by the tool, and explain that you are redirecting them to the about page in your text response.] " + req.message

    result = await Runner.run(triage_agent, directed_message, session=session)
    actions = extract_actions(result)
    
    # Programmatic fallback: if a main page is discussed but no redirect action was produced by the agent
    # (e.g. because it answered from chat history or called search_site_content), inject the redirect action.
    has_redirect = any(a.get("action") == "redirect" for a in actions)
    if not has_redirect and not is_chat_booking_or_form:
        prog_redirect = get_programmatic_redirect(req.message, pages)
        if prog_redirect:
            actions.append(prog_redirect)
            
    reply = result.final_output or ""
    clean_reply = reply.replace("**", "").replace("###", "").replace("##", "")
    return {"reply": clean_reply, "actions": actions}


@app.get("/")
async def root():
    return FileResponse(BASE_DIR / "static" / "index.html")


app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
