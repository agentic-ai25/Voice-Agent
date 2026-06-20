"""Unit tests for the voice agent's website-orchestration brain.

These cover the deterministic tool logic (intent → redirect, spoken direction →
history, keyword search) and the agent wiring (tools + handoffs registered).
They do NOT hit the network or require an OPENAI_API_KEY — the LLM-driven
behavior is verified manually / via LiveKit's eval tooling.
"""

import sys
from pathlib import Path

import pytest

# Make the agent's src/ importable (mirrors how the worker runs).
SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from site_prompts import SITE_CONTEXT, get_site_instructions  # noqa: E402
from website_agents import (  # noqa: E402
    booking_agent,
    confirm_booking,
    resolve_history,
    resolve_redirect,
    resolve_search,
    triage_agent,
)

PAGES = [
    {
        "url": "https://example.com/pricing",
        "title": "Pricing — Example",
        "page_type": "pricing",
        "summary": "Plans and prices.",
        "content": "Starter $0. Pro $29. Scale $99 per month.",
    },
    {
        "url": "https://example.com/product",
        "title": "Product — Example",
        "page_type": "product",
        "summary": "Features and integrations.",
        "content": "Automate workflows with triggers and actions.",
    },
    {
        "url": "https://example.com/blog",
        "title": "Blog — Example",
        "page_type": "blog",
        "summary": "Articles and guides.",
        "content": "How to scale automations reliably.",
    },
]


# --- resolve_redirect --------------------------------------------------------
@pytest.mark.parametrize(
    "intent,expected_type",
    [
        ("pricing", "pricing"),
        ("cost", "pricing"),
        ("plans", "pricing"),
        ("features", "product"),
        ("integration", "product"),
        ("blog", "blog"),
        ("article", "blog"),
    ],
)
def test_redirect_maps_intent_to_correct_page(intent, expected_type):
    out = resolve_redirect(intent, PAGES)
    assert out["action"] == "redirect"
    expected_url = next(p["url"] for p in PAGES if p["page_type"] == expected_type)
    assert out["url"] == expected_url
    # page_details must be present so the agent can summarize while navigating.
    assert out["page_details"]


def test_redirect_unknown_intent_returns_none():
    out = resolve_redirect("careers", PAGES)
    assert out["action"] == "none"


def test_redirect_prefers_most_specific_title_match():
    # When several titles contain the keyword, the tightest (shortest) title wins,
    # so "wati" goes to the 1:1 comparison page, not the 3-way page that also
    # mentions Wati. (Demo: "How does this compare to Wati?")
    pages = [
        {
            "url": "https://aisensy.com/aisensy-vs-interakt-vs-wati",
            "title": "Aisensy Vs Interakt Vs Wati",
            "page_type": "comparison",
            "summary": "",
            "content": "three-way comparison",
        },
        {
            "url": "https://aisensy.com/aisensy-vs-wati",
            "title": "Aisensy Vs Wati",
            "page_type": "comparison",
            "summary": "",
            "content": "Wati starts at 2,499.",
        },
    ]
    out = resolve_redirect("wati", pages)
    assert out["action"] == "redirect"
    assert out["url"] == "https://aisensy.com/aisensy-vs-wati"


# --- resolve_history ---------------------------------------------------------
@pytest.mark.parametrize("word", ["back", "previous", "prev", "go backward"])
def test_history_back_variants(word):
    # resolve_history matches on the normalized phrase; test the core tokens.
    assert resolve_history(word.replace("go ", "")) == {
        "action": "history",
        "direction": "back",
    }


@pytest.mark.parametrize("word", ["forward", "next", "ahead"])
def test_history_forward_variants(word):
    assert resolve_history(word) == {"action": "history", "direction": "forward"}


def test_history_unknown_direction():
    assert resolve_history("sideways")["action"] == "none"


# --- resolve_search ----------------------------------------------------------
def test_search_finds_relevant_page():
    out = resolve_search("how much does pro cost", PAGES)
    assert "pricing" in out.lower() or "Pro" in out


def test_search_no_match():
    assert (
        resolve_search("zzzznotarealword", PAGES)
        == "No matching content found on the site."
    )


# --- demo-mode booking -------------------------------------------------------
def test_confirm_booking_returns_schedule_confirmed_with_time():
    # Demo: "Yes, tomorrow afternoon." -> agent confirms a concrete slot.
    out = confirm_booking("Asha", "asha@example.com", "tomorrow at 3 PM")
    assert out["action"] == "schedule_confirmed"
    assert out["when"] == "tomorrow at 3 PM"
    assert out["email"] == "asha@example.com"


def test_booking_agent_uses_demo_slot_tool():
    # Booking must confirm the requested time directly, not hand back a link.
    assert "book_demo_slot" in {t.name for t in booking_agent.tools}


# --- agent wiring ------------------------------------------------------------
def test_triage_agent_has_expected_tools_and_handoffs():
    tool_names = {t.name for t in triage_agent.tools}
    assert {"search_site_content", "get_redirect_url", "navigate_history"} <= tool_names
    handoff_names = {h.name for h in triage_agent.handoffs}
    assert {"Lead Capture", "Booking"} == handoff_names


# --- per-site prompt templates -----------------------------------------------
def test_site_template_swaps_context_and_keeps_common_rules():
    sf = get_site_instructions("salesforce")
    default = get_site_instructions("default")
    assert "Salesforce" in sf and "Salesforce" not in default
    # Shared behavior rules are appended to every template.
    for instr in (sf, default):
        assert "navigate_history" in instr
        assert "action 'none'" in instr  # the don't-navigate-to-missing-page rule


def test_unknown_template_falls_back_to_default():
    assert get_site_instructions("nope") == get_site_instructions("default")
    assert "default" in SITE_CONTEXT
