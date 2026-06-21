# VoiceFlow

> Turn silent web pages into conversational interfaces. Your best salesperson, working 24/7.

**Team — Yardstick**

- **Demo video** — [watch the prototype in action](https://your-demo-video-link)
- **Pitch deck (Gamma)** — [view the deck](https://your-gamma-link)

---

## The Problem

Most websites are silent. Visitors land, scroll, and leave.

- **~97% of visitors** bounce without converting.
- **~50% of booked demos** don't show up.
- High-intent questions — *"How much for my use case?"*, *"How is this different from competitor X?"*, *"Does it integrate with my stack?"* — get **no answer in the moment**.
- Marketing pays for the click. Sales chases cold leads. CAC climbs.

The funnel leaks in the middle, exactly where intent is highest and no one is listening.

## What We Built

**VoiceFlow** is a voice AI agent that you embed on your website in 5 minutes via Google Tag Manager. Once installed, it:

| Step | What happens |
|------|--------------|
| **Listen** | Visitor speaks a question into the widget. |
| **Understand** | Agent parses intent, decides what to do. |
| **Navigate** | Opens the right page, highlights the relevant section. |
| **Speak** | Voices the answer in under a second. |

The agent is **grounded in your own website content** — it never hallucinates pricing or features. It qualifies leads in real time, books demos directly into your calendar, and gracefully hands off to a human when uncertain.

### Sample queries the prototype handles

Our prototype is built on top of [AiSensy](https://aisensy.com) — a WhatsApp Business platform — to showcase real-world performance on a real customer-facing site:

- *"How much does AiSensy cost for a Shopify store?"* → opens `/pricing`, explains tiers
- *"How is this different from Wati?"* → opens comparison page, gives verdict
- *"Can I take payments on WhatsApp?"* → opens features page, lists integrations
- *"Book me a demo for tomorrow afternoon."* → confirms calendar slot

## The Idea

Voice AI is finally ready: production-grade quality, sub-300ms latency, and roughly 10× cheaper than 18 months ago. **The hard part isn't the voice anymore — it's the interaction layer.**

What makes VoiceFlow different is the bidirectional sync between voice and visual UI: the agent speaks *while* navigating the page, highlights what it's talking about, and reacts to the user interrupting mid-sentence. Off-the-shelf voice SDKs don't do this. We built it.

## Tech Stack

### Voice Pipeline
- **[LiveKit Cloud](https://livekit.io)** — real-time audio transport over WebRTC
- **[Deepgram](https://deepgram.com)** — streaming speech-to-text
- **[OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents)** with **GPT-5.5** — reasoning, tool calling, conversation state
- **[ElevenLabs](https://elevenlabs.io)** — natural-sounding text-to-speech

### Interaction Layer *(our IP)*
- Custom DOM tools for navigation, scrolling, and element highlighting
- Bidirectional voice ⇄ visual sync, sub-second latency
- Voice barge-in (interruption handling) with automatic chat fallback
- Source-page citation on every answer

### Frontend & Infrastructure
- **Next.js** — embedded widget + admin dashboards
- **Supabase** — session storage, conversation logs, lead scoring
- **Vercel** — deployment for both widget and dashboards
- **Google Tag Manager** — one-script install for end customers

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  VOICE PIPELINE                                           │
│  LiveKit · Deepgram · OpenAI Agents SDK · ElevenLabs      │
└────────────────────────┬─────────────────────────────────┘
                         │ audio + intent
┌────────────────────────▼─────────────────────────────────┐
│  INTERACTION LAYER  (our IP)                              │
│  DOM tools · voice ⇄ visual sync · barge-in · citations   │
└────────────────────────┬─────────────────────────────────┘
                         │ navigate · highlight · speak
┌────────────────────────▼─────────────────────────────────┐
│  FRONTEND & INFRASTRUCTURE                                │
│  Next.js widget · Supabase · Vercel                       │
└──────────────────────────────────────────────────────────┘

         Install via one Google Tag Manager script.
```

## Demo

VoiceFlow is currently in private beta — a public live demo isn't hosted yet. To see the prototype in action:

- **Demo video** — 2-minute walkthrough: [your-demo-video-link](https://your-demo-video-link)
- **Pitch deck on Gamma** — [your-gamma-link](https://your-gamma-link)
- **Reference deployment** — built on [aisensy.com](https://aisensy.com) to showcase real visitor query handling

> *Live customer-facing demo available on request — reach out at the email below.*

## Safety & Responsible AI

- Answers are grounded in customer-indexed content only — out-of-scope queries route to human handoff, not free-form generation.
- AI disclosure on widget open, with a clear human-handoff option.
- Customer conversations are not used to train any foundation model.
- Every answer surfaces its source page for verification.

## Roadmap

| Status | When | What |
|--------|------|------|
| Shipped | Now | Demo prototype on AiSensy · Interaction layer in production |
| Next | 30 days | Self-serve onboarding · 10 design partners installed · Lead scoring |
| Next | 60 days | CRM integrations (HubSpot, Salesforce) · Calendar bookings · Public launch |
| Next | 90 days | Paid tier · Cross-sell into [gingerlabs.ai](https://gingerlabs.ai) |

## Team

**Yardstick** — part of the team at **[gingerlabs.ai](https://gingerlabs.ai)**, where we build browser agents.

## Contact

- **Demo video:** [your-demo-video-link](https://your-demo-video-link)
- **Pitch deck (Gamma):** [your-gamma-link](https://your-gamma-link)
- **Email:** `team@yardstick.ai`
- **Website:** [gingerlabs.ai](https://gingerlabs.ai)

---

*Submitted to [Hackathon Name].*
