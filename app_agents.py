"""
Runtime agents + tools for the website chat widget.

  triage_agent (the chat brain)
    - search_site_content   : answer questions from the scraped index
    - get_redirect_url      : send the visitor to pricing/blog/contact/...
    - handoff -> lead_agent : capture interest form submissions
    - handoff -> booking_agent : hand back a Calendly scheduling link

Tool results that should drive the UI return a structured dict with an
"action" key ("redirect" | "schedule" | "form_submitted"); server.py forwards
these to the widget so the frontend can navigate or render a button.
"""
import json
import os
import contextvars

import httpx
from dotenv import load_dotenv
from agents import Agent, function_tool

load_dotenv()

# ContextVar to hold the active pages list for the current request context (thread-safe and request-scoped)
current_site_pages = contextvars.ContextVar("current_site_pages", default=[])

# --- load the one-time scrape ------------------------------------------------
try:
    with open("site_index.json", encoding="utf-8") as fh:
        SITE = json.load(fh)
except FileNotFoundError:  # let the app boot; ingest hasn't run yet
    SITE = {"seed": "", "pages": []}

PAGES = SITE["pages"]


# --- retrieval (simple JSON keyword index) -----------------------------------
@function_tool
def search_site_content(query: str) -> str:
    """Search the website's scraped content to answer the visitor's question.
    Do NOT call this tool if the user is asking about, mentions, or discusses pricing, product/features, blog, about/team, or contact/demo pages. Call get_redirect_url instead.
    Returns the most relevant pages with their summary, content snippet and URL."""
    q = query.lower()
    terms = [t for t in q.split() if len(t) > 2]
    
    pages = current_site_pages.get()
    if not pages:
        pages = PAGES

    def score(p):
        hay = (p["title"] + " " + p["summary"] + " " + p["content"]).lower()
        return sum(hay.count(t) for t in terms)

    ranked = sorted(pages, key=score, reverse=True)
    hits = [p for p in ranked if score(p) > 0][:3]
    if not hits:
        return "No matching content found on the site."
    return json.dumps([
        {"title": p["title"], "url": p["url"], "summary": p["summary"],
         "snippet": p["content"][:600]}
        for p in hits
    ])


# --- intelligent redirection -------------------------------------------------
@function_tool
def get_redirect_url(intent: str) -> dict:
    """Get the best page to redirect the visitor to.
    You MUST call this tool whenever the visitor asks about, mentions, discusses, or wants to see
    anything related to:
    - pricing, costs, pricing plans, or price tiers (intent='pricing')
    - product features, integrations, triggers, actions, or how it works (intent='product')
    - blog posts, articles, guides, or reading material (intent='blog')
    - contact form, email, booking a demo, talking to us, calendar (intent='contact')
    - company details, founders, values, about us, team (intent='about')
    - homepage, landing page (intent='home')
    Do not hesitate to call this. Calling this tool automatically navigates the user's UI to the correct page in real-time while you explain."""
    intent = intent.lower().strip()
    
    # Map common synonyms to exact index page_types
    mapping = {
        "cost": "pricing",
        "plans": "pricing",
        "price": "pricing",
        "prices": "pricing",
        "pricing": "pricing",
        
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
    
    normalized_intent = mapping.get(intent, intent)
    
    pages = current_site_pages.get()
    if not pages:
        pages = PAGES
    
    page = next((p for p in pages if p["page_type"] == normalized_intent), None)
    if not page:
        page = next((p for p in pages if normalized_intent in p["page_type"].lower()), None)
    if not page:
        page = next((p for p in pages if normalized_intent in p["title"].lower()), None)
    if not page:
        page = next((p for p in pages if intent in p["title"].lower()), None)
        
    if not page:
        return {"action": "none", "message": f"No '{intent}' page found."}
    
    # Return the redirect action along with the page content snippet so the LLM can explain it immediately
    return {
        "action": "redirect",
        "url": page["url"],
        "label": page["title"],
        "page_details": page["content"][:1200]
    }


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
        except Exception as e:  # noqa: BLE001
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

    # Best case: mint a single-use scheduling link via the API.
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
        except Exception as e:  # noqa: BLE001 - fall back to public link
            print(f"[calendly] API failed, using public link: {e}")
            url = os.environ.get("CALENDLY_SCHEDULING_URL", "")
    else:
        url = os.environ.get("CALENDLY_SCHEDULING_URL", "")

    # Prefill name/email so the visitor doesn't retype them.
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
lead_agent = Agent(
    name="Lead Capture",
    model="gpt-4o-mini",
    handoff_description="Use this if the visitor explicitly wants to fill out the contact form, submit details, or send an inquiry directly in the chat instead of visiting the contact page.",
    instructions=(
        "Collect the visitor's name, email, and what they're interested in. "
        "Read the details back to confirm, then call submit_interest_form. "
        "Confirm success warmly and offer to book a meeting if relevant.\n"
        "CRITICAL: Do NOT use any markdown formatting (like asterisks '**' or '_') in your response. Output only clean, plain text."
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
        "CRITICAL: Do NOT use any markdown formatting (like asterisks '**' or '_') in your response. Output only clean, plain text."
    ),
    tools=[book_calendar_meeting],
)

triage_agent = Agent(
    name="Website Assistant",
    model="gpt-4o-mini",
    instructions=(
        "You are the friendly chat assistant embedded on this company's website. "
        "CRITICAL RULE: If the visitor's query relates to, asks about, mentions, or discusses any main page "
        "(Pricing/Cost, Product/Features, Blog, Contact, About), you MUST call get_redirect_url for that page immediately. "
        "You MUST call get_redirect_url EVERY single time these topics are mentioned, even if you already know the details "
        "or have them in your conversation history. Calling get_redirect_url is the ONLY way the frontend UI knows to "
        "automatically navigate the user to that page.\n"
        "RESPONSE RULES:\n"
        "1. Never output a simple 'taking you to X' message. The get_redirect_url tool will return the page content "
        "details inside the 'page_details' field. You MUST read this content and write a detailed explanation "
        "(e.g., outline the specific pricing tiers and limits if they ask about pricing, or list product features "
        "if they ask about product) in your text response in addition to confirming that you are redirecting them to that page.\n"
        "2. CRITICAL: Always state the redirection as an automatic fact (e.g., 'I am taking you to the pricing page now to show you the details...'). "
        "Never ask the user for permission to redirect, never say 'If you want, I can take you there', and never ask if they want to go. Just redirect them by default.\n"
        "3. Never print raw URLs in your response. The UI handles the redirection automatically in the background.\n"
        "4. CRITICAL: Do NOT use any markdown formatting (like asterisks '**' or '_') in your response. Output only clean, plain text (e.g., write 'Starter:' instead of '**Starter**:').\n"
        "5. FORM FILLING: If the visitor wants to fill out a website form (or if you see a form available in the site index 'forms' key for the page they are interested in), offer to fill it out for them in the chat. Ask for the required field values, and call submit_website_form. Otherwise, if the visitor explicitly asks to fill out a contact form or book a demo in the chat, hand off to the Lead Capture agent or Booking agent respectively.\n"
        "Be concise, professional, and warm. Never make up prices, features, or URLs that are not in the index."
    ),
    tools=[search_site_content, get_redirect_url, submit_website_form],
    handoffs=[lead_agent, booking_agent],
)
