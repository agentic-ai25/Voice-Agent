import asyncio
import json
import logging

# OpenAI Agents SDK — the orchestration brain. LiveKit owns transport + STT/TTS;
# the triage_agent (with its tools + handoffs + site index) owns the thinking.
from agents import Runner
from agents.items import ToolCallOutputItem
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    ModelSettings,
    TurnHandlingOptions,
    cli,
    get_job_context,
    inference,
    llm,
    room_io,
)
from livekit.plugins import (
    ai_coustics,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from openai.types.responses import ResponseTextDeltaEvent

from website_agents import current_site_pages, load_pages_for, make_triage_agent

logger = logging.getLogger("agent-assistant-2473")

load_dotenv(".env.local")

# Topic used to forward structured UI actions (redirect/history/schedule/...) to
# the web widget over the LiveKit data channel.
UI_ACTION_TOPIC = "lk.ui.action"


class DefaultAgent(Agent):
    """LiveKit agent whose brain is the OpenAI Agents SDK `triage_agent`.

    We override `llm_node` so that every finalized user turn is routed through
    `Runner.run_streamed(triage_agent, ...)`. Text deltas are yielded straight
    into LiveKit's TTS, and any structured tool action (redirect/history/etc.)
    is published to the room so the frontend can drive the page in real time.

    The `llm=` passed to AgentSession is a stub that satisfies the framework's
    type check but is never actually invoked — all generation happens here.
    """

    def __init__(self, oai_agent, pages: list) -> None:
        super().__init__(
            instructions="(routing handled by the openai-agents triage_agent)",
        )
        # The per-session openai-agents brain (prompt chosen for this site) and
        # the page index its tools resolve navigation against.
        self._oai_agent = oai_agent
        self._pages = pages
        # Rolling input list for the Agents SDK Runner. This is the source of
        # truth for conversation history (tool results, handoffs, etc.), so we
        # persist it across turns via Runner's `to_input_list()`.
        self._oai_input: list = []
        # Dedupe actions already published this turn (a tool may surface once).
        self._published_actions: set = set()
        # Hold references to fire-and-forget publish tasks so they aren't GC'd.
        self._bg_tasks: set = set()

    async def on_enter(self):
        # Deterministic spoken greeting — no need to round-trip the LLM for this,
        # and it keeps the very first utterance fast.
        self.session.say(
            "Hi! I'm the assistant for this site. Ask me anything, and I can "
            "answer or take you to the right page."
        )

    def _publish_action(self, action: dict) -> None:
        """Forward a structured UI action to the web widget over the data channel."""
        key = json.dumps(action, sort_keys=True)
        if key in self._published_actions:
            return
        self._published_actions.add(key)
        try:
            room = get_job_context().room
            payload = json.dumps(action).encode("utf-8")
            # Fire-and-forget; the widget listens on UI_ACTION_TOPIC.
            task = asyncio.create_task(
                room.local_participant.publish_data(
                    payload, reliable=True, topic=UI_ACTION_TOPIC
                )
            )
            self._bg_tasks.add(task)
            task.add_done_callback(self._bg_tasks.discard)
            logger.info("published ui action: %s", action.get("action"))
        except Exception as e:
            logger.warning("failed to publish ui action: %s", e)

    async def llm_node(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool],
        model_settings: ModelSettings,
    ):
        # The newest user turn LiveKit just transcribed.
        user_msgs = [
            it
            for it in chat_ctx.items
            if getattr(it, "role", None) == "user" and getattr(it, "text_content", None)
        ]
        last_user = user_msgs[-1].text_content if user_msgs else ""
        if not last_user:
            return

        # Make this site's pages available to the triage_agent's tools this turn.
        current_site_pages.set(self._pages)
        self._published_actions.clear()
        self._oai_input.append({"role": "user", "content": last_user})

        try:
            result = Runner.run_streamed(self._oai_agent, input=self._oai_input)
            async for ev in result.stream_events():
                # Text deltas → straight to TTS.
                if ev.type == "raw_response_event" and isinstance(
                    ev.data, ResponseTextDeltaEvent
                ):
                    if ev.data.delta:
                        yield ev.data.delta
                # Tool outputs → forward UI actions as soon as they happen, so the
                # page can navigate while the agent is still speaking.
                elif ev.type == "run_item_stream_event" and ev.name == "tool_output":
                    item = ev.item
                    if isinstance(item, ToolCallOutputItem):
                        out = item.output
                        if isinstance(out, dict) and out.get("action") not in (
                            None,
                            "none",
                        ):
                            self._publish_action(out)
            # Persist the full turn (tool calls, results, handoffs) for next time.
            self._oai_input = result.to_input_list()
        except Exception:
            logger.exception("triage_agent run failed")
            yield "Sorry, I ran into a problem answering that. Could you try again?"
            # Drop the failed user turn so it doesn't poison the next run.
            if self._oai_input and self._oai_input[-1].get("role") == "user":
                self._oai_input.pop()


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="assistant-2473")
async def entrypoint(ctx: JobContext):
    # Per-site config arrives via agent dispatch metadata (set by the web token
    # API from what the widget requested): which prompt template to use and which
    # page index to navigate against. Falls back to the default site.
    template: str | None = None
    site_id: str | None = None
    raw_meta = getattr(ctx.job, "metadata", "") or ""
    if raw_meta:
        try:
            meta = json.loads(raw_meta)
            template = meta.get("template") or None
            site_id = meta.get("site_id") or meta.get("sandbox_id") or None
        except (ValueError, AttributeError):
            logger.warning("could not parse job metadata: %r", raw_meta)
    logger.info("session site config: template=%s site_id=%s", template, site_id)

    oai_agent = make_triage_agent(template)
    pages = load_pages_for(site_id)

    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="en"),
        # Stub LLM: required by the pipeline type, but never invoked because
        # `DefaultAgent.llm_node` fully overrides generation.
        llm=inference.LLM(
            model="openai/gpt-4.1-nano",
        ),
        tts=inference.TTS(
            model="cartesia/sonic-3",
            voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
            language="en"
        ),
        turn_handling=TurnHandlingOptions(turn_detection=MultilingualModel()),
        vad=ctx.proc.userdata["vad"],
        # Disabled: tools have side effects (publishing UI actions, submitting
        # forms), so we must not speculatively run a turn that may be discarded.
        preemptive_generation=False,
    )

    await session.start(
        agent=DefaultAgent(oai_agent=oai_agent, pages=pages),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            # Keep the agent session alive when the visitor briefly disconnects
            # (e.g. while the host page navigates on a redirect). The widget
            # reconnects to the same room on the new page and the conversation —
            # including its memory — continues. LiveKit reaps the room if the
            # visitor never comes back (empty-room timeout).
            close_on_disconnect=False,
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_S,
                ),
            ),
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
