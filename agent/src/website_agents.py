"""
Website orchestration brain for the LiveKit *voice* agent.

This is the OpenAI Agents SDK side of the bridge. The LiveKit worker
(`agent.py`) owns transport + STT/TTS; this module owns the "brain":

  triage_agent (the voice assistant)
    - search_site_content     : answer questions from the scraped index
    - get_redirect_url        : navigate the visitor to pricing/blog/contact/...
    - navigate_history        : go to the previous / next page (browser back/forward)
    - submit_website_form     : fill + submit a form found on the site
    - handoff -> lead_agent   : capture interest form submissions in-chat
    - handoff -> booking_agent : hand back a Calendly scheduling link

Tools that should drive the UI return a structured dict with an "action" key
("redirect" | "history" | "schedule" | "form_submitted"). agent.py captures
these during the run and forwards them over the LiveKit data channel so the web
widget can navigate the page in real time.

This mirrors the root-level `app_agents.py` (which serves the FastAPI text
widget) but is bundled inside `agent/` so it ships to LiveKit Cloud with the
worker. Keep the two in sync when changing tool/agent behavior.
"""
import contextvars
import json
import os
from pathlib import Path

import httpx
from agents import Agent, function_tool

from site_prompts import get_site_instructions

# ContextVar holding the active pages list for the current turn (request-scoped).
# Defaults to None; `_pages()` falls back to the bundled PAGES when unset.
current_site_pages = contextvars.ContextVar("current_site_pages", default=None)

# --- site indices ------------------------------------------------------------
# The default bundled scrape, plus an optional per-site directory so one worker
# can serve multiple client sites (indices/<site_id>.json).
_AGENT_DIR = Path(__file__).resolve().parent.parent
_INDEX_PATH = _AGENT_DIR / "site_index.json"
_INDICES_DIR = _AGENT_DIR / "indices"
try:
    with _INDEX_PATH.open(encoding="utf-8") as fh:
        SITE = json.load(fh)
except FileNotFoundError:  # let the worker boot even if ingest hasn't run
    SITE = {"seed": "", "pages": []}

PAGES = SITE["pages"]


def load_pages_for(site_id: str | None) -> list[dict]:
    """Load the page index for a client site id (indices/<site_id>.json),
    falling back to the bundled default index."""
    if site_id:
        safe = site_id.replace("/", "_").replace(":", "_").replace(".", "_")
        index_path = _INDICES_DIR / f"{safe}.json"
        if index_path.exists():
            try:
                with index_path.open(encoding="utf-8") as fh:
                    return json.load(fh).get("pages", PAGES)
            except Exception:
                pass
    return PAGES


def _pages() -> list[dict]:
    pages = current_site_pages.get()
    return pages if pages else PAGES


# Map common synonyms to the exact page_type values produced by the crawler.
INTENT_MAPPING = {
    "cost": "pricing", "plans": "pricing", "price": "pricing",
    "prices": "pricing", "pricing": "pricing",
    "features": "product", "feature": "product", "integrations": "product",
    "integration": "product", "product": "product", "workflow": "product",
    "workflows": "product",
    "about": "about", "team": "about", "values": "about", "founders": "about",
    "blog": "blog", "post": "blog", "posts": "blog", "article": "blog",
    "articles": "blog",
    "contact": "contact", "demo": "contact", "book": "contact",
    "meeting": "contact", "email": "contact",
    "home": "home", "homepage": "home", "start": "home",
}


# --- pure helpers (no @function_tool wrapper, so they're unit-testable) -------
def resolve_search(query: str, pages: list[dict]) -> str:
    """Keyword-rank `pages` against `query`; return a JSON string of up to 3 hits."""
    q = query.lower()
    terms = [t for t in q.split() if len(t) > 2]

    def score(p):
        hay = (p["title"] + " " + p["summary"] + " " + p["content"]).lower()
        return sum(hay.count(t) for t in terms)

    ranked = sorted(pages, key=score, reverse=True)
    hits = [p for p in ranked if score(p) > 0][:3]
    if not hits:
        return "No matching content found on the site."
    return json.dumps(
        [
            {
                "title": p["title"],
                "url": p["url"],
                "summary": p["summary"],
                "snippet": p["content"][:600],
            }
            for p in hits
        ]
    )


def resolve_redirect(intent: str, pages: list[dict]) -> dict:
    """Resolve an intent to a `{"action": "redirect", ...}` dict (or `none`)."""
    intent = intent.lower().strip()
    normalized_intent = INTENT_MAPPING.get(intent, intent)

    page = next((p for p in pages if p["page_type"] == normalized_intent), None)
    if not page:
        page = next((p for p in pages if normalized_intent in p["page_type"].lower()), None)
    if not page:
        page = next((p for p in pages if normalized_intent in p["title"].lower()), None)
    if not page:
        page = next((p for p in pages if intent in p["title"].lower()), None)

    if not page:
        return {"action": "none", "message": f"No '{intent}' page found."}

    return {
        "action": "redirect",
        "url": page["url"],
        "label": page["title"],
        "page_details": page["content"][:1200],
    }


def resolve_history(direction: str) -> dict:
    """Normalize a spoken direction to a `{"action": "history", ...}` dict."""
    d = direction.lower().strip()
    if d in ("back", "previous", "prev", "backward", "backwards"):
        return {"action": "history", "direction": "back"}
    if d in ("forward", "next", "ahead"):
        return {"action": "history", "direction": "forward"}
    return {"action": "none", "message": f"Unknown direction '{direction}'."}


# --- retrieval (simple JSON keyword index) -----------------------------------
@function_tool
def search_site_content(query: str) -> str:
    """Search the website's scraped content to answer the visitor's question.
    Do NOT call this tool if the user is asking about, mentions, or discusses pricing, product/features, blog, about/team, or contact/demo pages. Call get_redirect_url instead.
    Returns the most relevant pages with their summary, content snippet and URL."""
    return resolve_search(query, _pages())


# --- intelligent redirection -------------------------------------------------
@function_tool
def get_redirect_url(intent: str) -> dict:
    """Get the best page to navigate the visitor to.
    You MUST call this tool whenever the visitor asks about, mentions, discusses, or wants to see
    anything related to:
    - pricing, costs, pricing plans, or price tiers (intent='pricing')
    - product features, integrations, triggers, actions, or how it works (intent='product')
    - blog posts, articles, guides, or reading material (intent='blog')
    - contact form, email, booking a demo, talking to us, calendar (intent='contact')
    - company details, founders, values, about us, team (intent='about')
    - homepage, landing page (intent='home')
    Do not hesitate to call this. Calling this tool automatically navigates the user's UI to the correct page in real-time while you explain."""
    return resolve_redirect(intent, _pages())


# --- browser history navigation ----------------------------------------------
@function_tool
def navigate_history(direction: str) -> dict:
    """Navigate the visitor's browser through its history.
    Call this when the visitor asks to 'go back', 'previous page', 'go forward',
    or 'next page'. Use direction='back' to go to the previous page and
    direction='forward' to go to the next page. The UI performs the navigation
    automatically; do not print URLs."""
    return resolve_history(direction)


# --- lead capture / interest form --------------------------------------------
@function_tool
def submit_interest_form(name: str, email: str, message: str) -> dict:
    """Submit the visitor's interest/contact form once name, email and a short
    message have been collected and confirmed."""
    webhook = os.environ.get("INTEREST_FORM_WEBHOOK")
    payload = {"name": name, "email": email, "message": message}
    if webhook:
        try:
            httpx.post(webhook, json=payload, timeout=15).raise_for_status()
        except Exception as e:
            return {"action": "error", "message": f"Submit failed: {e}"}
    else:
        print(f"[interest form] {payload}")  # demo mode: log it
    return {"action": "form_submitted", "email": email}


# --- Calendly booking --------------------------------------------------------
@function_tool
def book_calendar_meeting(name: str, email: str) -> dict:
    """Generate a Calendly scheduling link (prefilled with the visitor's name
    and email) for them to pick a time. Calendly requires the invitee to choose
    a slot, so return the link for the widget to open. Confirm name+email first."""
    token = os.environ.get("CALENDLY_API_TOKEN")
    event_type = os.environ.get("CALENDLY_EVENT_TYPE_URI")

    if token and event_type:
        try:
            r = httpx.post(
                "https://api.calendly.com/scheduling_links",
                headers={"Authorization": f"Bearer {token}",
                         "Content-Type": "application/json"},
                json={"max_event_count": 1, "owner": event_type,
                      "owner_type": "EventType"},
                timeout=15,
            )
            r.raise_for_status()
            url = r.json()["resource"]["booking_url"]
        except Exception as e:
            print(f"[calendly] API failed, using public link: {e}")
            url = os.environ.get("CALENDLY_SCHEDULING_URL", "")
    else:
        url = os.environ.get("CALENDLY_SCHEDULING_URL", "")

    if url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}name={httpx.QueryParams({'n': name})['n']}&email={email}"

    return {"action": "schedule", "url": url, "label": "Pick a time"}


# --- generic website form submission ----------------------------------------
@function_tool(strict_mode=False)
def submit_website_form(form_action: str, form_data: dict) -> dict:
    """Submit a form present on the website by sending a POST request to its action URL with the collected form data.
    You must collect all the required fields from the visitor through conversation first."""
    webhook = os.environ.get("INTEREST_FORM_WEBHOOK")
    payload = {"action": form_action, "data": form_data}
    if webhook:
        try:
            httpx.post(webhook, json=payload, timeout=15).raise_for_status()
        except Exception as e:
            return {"action": "error", "message": f"Form submit failed: {e}"}
    else:
        print(f"[web form submit] Action: {form_action}, Data: {form_data}")
    return {"action": "form_submitted", "message": "Form submitted successfully!"}


# --- agents ------------------------------------------------------------------
# NOTE: voice replies must be plain text (they are spoken), so every agent is
# told to avoid markdown — same rule as the text widget.
lead_agent = Agent(
    name="Lead Capture",
    model="gpt-4o-mini",
    handoff_description="Use this if the visitor explicitly wants to fill out the contact form, submit details, or send an inquiry directly in the chat instead of visiting the contact page.",
    instructions=(
        "Collect the visitor's name, email, and what they're interested in. "
        "Read the details back to confirm, then call submit_interest_form. "
        "Confirm success warmly and offer to book a meeting if relevant.\n"
        "CRITICAL: This is a spoken voice conversation. Do NOT use any markdown "
        "formatting. Output only clean, plain text. Keep replies short (1-2 sentences)."
    ),
    tools=[submit_interest_form],
)

booking_agent = Agent(
    name="Booking",
    model="gpt-4o-mini",
    handoff_description="Use this if the visitor explicitly wants to book a demo, schedule a meeting, or get a booking link directly in the chat instead of visiting the contact page.",
    instructions=(
        "Get the visitor's name and email, confirm them, then call "
        "book_calendar_meeting. Tell them a scheduling link will open where they "
        "pick a time. Do not invent times yourself.\n"
        "CRITICAL: This is a spoken voice conversation. Do NOT use any markdown "
        "formatting. Output only clean, plain text. Keep replies short (1-2 sentences)."
    ),
    tools=[book_calendar_meeting],
)

# Instructions come from a swappable per-site template (see site_prompts.py).
# A worker can serve multiple client sites, so build the triage agent per session
# with the template the widget requested (passed via agent dispatch metadata).
def make_triage_agent(template: str | None = None) -> Agent:
    return Agent(
        name="Website Assistant",
        model="gpt-4o-mini",
        instructions=get_site_instructions(template),
        tools=[search_site_content, get_redirect_url, navigate_history, submit_website_form],
        handoffs=[lead_agent, booking_agent],
    )


# Default agent (used when no per-site template is supplied, and by tests).
triage_agent = make_triage_agent()
