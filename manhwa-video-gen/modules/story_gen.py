"""
story_gen.py — Generate a manhwa script from a one-line idea using Claude API.

Usage (standalone)
──────────────────
    from modules.story_gen import generate_story
    script_path = generate_story(
        idea="A girl discovers she has powers in Seoul",
        genre="fantasy",
        num_scenes=6,
        output_path=Path("scripts/my_story.txt"),
    )

Via main.py
───────────
    python main.py --idea "una chica que descubre poderes en Seúl" --genre fantasy
    python main.py --idea "two rivals forced to share an apartment" --genre romance --num-scenes 5

Genres supported
────────────────
    romance · action · fantasy · horror · (auto — detected from idea)

Requirements
────────────
    pip install anthropic
    export ANTHROPIC_API_KEY=sk-ant-...  (or set in env / .env file)
"""

from __future__ import annotations

import os
import re
import textwrap
from pathlib import Path


# ── Genre system prompts ──────────────────────────────────────────────────────

_GENRE_TONE: dict[str, str] = {
    "romance": (
        "tone: bittersweet and tender, slow-burn emotional tension, longing glances, "
        "unspoken feelings, soft color palettes (pinks, golds, cherry blossoms). "
        "Dialogue reveals character through restraint — what characters don't say matters."
    ),
    "action": (
        "tone: kinetic and urgent, high-stakes confrontations, short punchy dialogue, "
        "dramatic lighting (deep shadows, neon, fire). "
        "Each scene should feel like a beat in a fight or chase sequence."
    ),
    "fantasy": (
        "tone: mythic and wonder-filled, ancient secrets, powers awakening, "
        "lush otherworldly environments (floating ruins, glowing forests, spirit realms). "
        "Characters face choices between destiny and desire."
    ),
    "horror": (
        "tone: dread and unease, creeping wrongness, unreliable perception, "
        "oppressive atmospheres (decaying halls, moonlit fog, mirrors). "
        "Dialogue is sparse; what the characters see defies explanation."
    ),
    "auto": "",
}

# ── Master system prompt ──────────────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent("""\
    You are a creative director for a manhwa (Korean graphic novel) video series.
    Your job: turn a one-line story idea into a complete, production-ready script
    that will be fed into an automated video pipeline.

    ═══════════════════════════════════════════════════════
    OUTPUT FORMAT — follow this EXACTLY, no deviations
    ═══════════════════════════════════════════════════════

    TÍTULO: <title in English, evocative and short>

    PERSONAJES:
      <CHARACTER_NAME>: <physical appearance — optimized for Stable Diffusion XL>
      (repeat for each named character, 2-4 characters max)

    ESCENA 1
    FONDO: <background/environment — SDXL prompt style, no character names>
    NARRADOR: <narration line — 1 sentence, atmospheric>
    <CHARACTER>: <dialogue line>
    (more dialogue lines as needed)

    ESCENA 2
    ...

    ═══════════════════════════════════════════════════════
    RULES — strictly enforced
    ═══════════════════════════════════════════════════════

    CHARACTER NAMES: always UPPERCASE in the script body (matches PERSONAJES section).
    NARRADOR: use for atmospheric narration (not character speech).
    FONDO: must be a Stable Diffusion XL-style prompt:
        - comma-separated descriptive tags
        - lighting, time of day, mood, art style (manhwa, webtoon)
        - NO character names or actions — only environment/setting
        - example: "modern Seoul rooftop at dusk, city lights below,
          dramatic orange-purple sky, manhwa style, cinematic framing"
    CHARACTER APPEARANCE (PERSONAJES):
        - Write exactly once per character; the pipeline reuses it for EVERY scene
        - Format: age, ethnicity, hair, eyes, clothing, distinctive features
        - Must be valid SDXL prompt tags: "korean female 20s, long straight black hair,
          light gray eyes, white school uniform, pale skin, soft expression"
        - Be specific and consistent — this is the character's "lock" across all scenes
    DIALOGUE: natural, character-driven, never expository.
        Subtext > explicit statement.
    PACING: scenes should be 2-4 dialogue lines each (not counting NARRADOR).
    CONTINUITY: reference previous scenes subtly to build narrative momentum.

    ═══════════════════════════════════════════════════════
    DO NOT include
    ═══════════════════════════════════════════════════════
    - scene numbers in FONDO descriptions
    - stage directions in dialogue
    - markdown, bold, headers, extra blank lines between dialogue lines
    - any text outside the specified format
    - English in TÍTULO if the idea was in Spanish (match the input language)
""")


# ── Public API ────────────────────────────────────────────────────────────────

def generate_story(
    idea: str,
    genre: str = "auto",
    num_scenes: int = 6,
    output_path: Path | None = None,
    model: str = "claude-sonnet-4-6",
    api_key: str | None = None,
) -> Path:
    """
    Generate a manhwa script from a one-line idea.

    Args:
        idea:        One-sentence story premise.
        genre:       'romance' | 'action' | 'fantasy' | 'horror' | 'auto'
        num_scenes:  Number of scenes to generate (4–10 recommended).
        output_path: Where to save the .txt file. Defaults to scripts/<slug>.txt
        model:       Claude model to use.
        api_key:     Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.

    Returns:
        Path to the saved script file.
    """
    try:
        import anthropic  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "anthropic SDK not installed. Run: pip install anthropic"
        ) from exc

    key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError(
            "No Anthropic API key found.\n"
            "Set the ANTHROPIC_API_KEY environment variable or pass api_key= to generate_story()."
        )

    genre = genre.lower()
    if genre not in _GENRE_TONE:
        print(f"  [WARN] Unknown genre '{genre}', using 'auto'")
        genre = "auto"

    # ── Build user prompt ─────────────────────────────────────────────────────
    genre_instruction = (
        f"\nGenre / tone: {_GENRE_TONE[genre]}" if _GENRE_TONE.get(genre) else ""
    )

    user_prompt = textwrap.dedent(f"""\
        Story idea: {idea}
        Number of scenes: {num_scenes}{genre_instruction}

        Generate the complete script following the format exactly.
        Make it emotionally engaging, visually rich, and production-ready.
    """)

    print(f"  Calling Claude ({model})...")
    print(f"  Idea    : {idea}")
    print(f"  Genre   : {genre}")
    print(f"  Scenes  : {num_scenes}")

    client = anthropic.Anthropic(api_key=key)

    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text: str = message.content[0].text
    print(f"  Tokens  : {message.usage.input_tokens} in / {message.usage.output_tokens} out")

    # ── Validate basic structure ───────────────────────────────────────────────
    _validate_script(raw_text, num_scenes)

    # ── Save to disk ──────────────────────────────────────────────────────────
    if output_path is None:
        slug = _to_slug(idea)
        scripts_dir = Path(__file__).parent.parent / "scripts"
        scripts_dir.mkdir(exist_ok=True)
        output_path = scripts_dir / f"{slug}.txt"

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(raw_text, encoding="utf-8")
    print(f"  Saved   : {output_path}")

    return output_path


# ── Internal helpers ──────────────────────────────────────────────────────────

def _validate_script(text: str, expected_scenes: int) -> None:
    """Warn (don't raise) if the script looks malformed."""
    scenes_found = len(re.findall(r"^ESCENA\s+\d+", text, re.MULTILINE | re.IGNORECASE))
    if scenes_found == 0:
        print("  [WARN] No ESCENA blocks found — script may be malformed.")
    elif scenes_found != expected_scenes:
        print(f"  [WARN] Expected {expected_scenes} scenes, got {scenes_found}.")

    if not re.search(r"^T[IÍ]TULO\s*:", text, re.MULTILINE | re.IGNORECASE):
        print("  [WARN] TÍTULO line not found in generated script.")

    if not re.search(r"^FONDO\s*:", text, re.MULTILINE | re.IGNORECASE):
        print("  [WARN] No FONDO lines found — image generation may fail.")


def _to_slug(text: str, max_len: int = 40) -> str:
    """Convert a string to a safe filename slug."""
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    slug = re.sub(r"[\s_]+", "_", slug).strip("_")
    return slug[:max_len] or "story"
