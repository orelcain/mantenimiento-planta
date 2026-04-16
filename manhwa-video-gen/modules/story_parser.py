"""
story_parser.py — Parse a manhwa script (.txt) into structured scene data.

Script format
─────────────
    TÍTULO: My Story

    PERSONAJES:
      YUNA: korean girl 20 years old, long black hair, gray eyes
      SOMBRA: dark faceless figure, black cloak

    ESCENA 1
    FONDO: empty high school hallway, late afternoon, orange light
    NARRADOR: Yuna always arrived last.
    YUNA: Is there anyone there?

    ESCENA 2
    FONDO: same hallway, darker, flickering lights
    SOMBRA: I always knew you would come.
    YUNA: That's impossible. I don't know you.

Rules
─────
- PERSONAJES block is indented (spaces or tabs).
- Each ESCENA block ends when the next ESCENA or EOF is reached.
- Speaker names are normalized to UPPERCASE.
- NARRADOR lines set is_narration = True.
- Unknown speakers (not in PERSONAJES) are allowed — they just won't have
  appearance descriptions for image prompts.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Character:
    name: str
    appearance: str


@dataclass
class DialogueLine:
    speaker: str
    text: str
    is_narration: bool = False


@dataclass
class Scene:
    number: int
    background: str
    dialogue: list[DialogueLine] = field(default_factory=list)

    def speakers(self) -> list[str]:
        """Return unique non-narrator speakers in this scene."""
        return list({d.speaker for d in self.dialogue if not d.is_narration})


@dataclass
class ParsedScript:
    title: str
    characters: dict[str, Character]
    scenes: list[Scene]

    def character_appearance(self, name: str) -> str | None:
        char = self.characters.get(name.upper())
        return char.appearance if char else None


# ── Public API ────────────────────────────────────────────────────────────────

def parse_script(path: str | Path) -> ParsedScript:
    """Parse a script file and return a ParsedScript."""
    text = Path(path).read_text(encoding="utf-8")
    return _parse(text)


def parse_script_text(text: str) -> ParsedScript:
    """Parse a script from a raw string."""
    return _parse(text)


# ── Internal ──────────────────────────────────────────────────────────────────

_SCENE_RE = re.compile(r"^ESCENA\s+(\d+)\s*$", re.IGNORECASE)

# Comillas tipográficas que los LLMs usan frecuentemente
_OPEN_QUOTES  = ('"', '\u201c', '\u00ab')   # " « "
_CLOSE_QUOTES = ('"', '\u201d', '\u00bb')   # " » "


def _preprocess_markdown(text: str) -> str:
    """Normaliza output markdown de LLMs (llama3.2, gemini, etc.) a formato plain-text.

    Transforma:
      **TÍTULO:** "Mi Historia"   →  TÍTULO: Mi Historia
      **ESCENA 1**                →  ESCENA 1
      * **AKIRA**: descripción    →    AKIRA: descripción  (con 2 espacios de indent)
      FONDO: "texto con comillas" →  FONDO: texto con comillas
      AKIRA: (en voz baja) "Hola" →  AKIRA: Hola
    """
    lines = []
    for line in text.splitlines():
        # 1. Líneas con viñeta (bullet) → 2 espacios de indent para bloque PERSONAJES
        m = re.match(r'^(\s*)[*\-•]\s+(.*)', line)
        if m:
            indent = m.group(1) if m.group(1) else '  '
            line = indent + m.group(2)

        # 2. **negrita** → texto plano
        line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)

        # 3. Limpiar valor tras ":" (comillas envolventes y stage directions)
        colon_idx = line.find(':')
        if colon_idx > 0:
            key = line[:colon_idx].strip()
            val = line[colon_idx + 1:].strip()
            if val:
                # Quitar dirección de escena tipo (en voz baja) / (con furia)
                val = re.sub(r'^\s*\([^)]*\)\s*', '', val)
                # Quitar comillas envolventes
                if (len(val) >= 2
                        and val[0] in _OPEN_QUOTES
                        and val[-1] in _CLOSE_QUOTES):
                    val = val[1:-1].strip()
                line = line[:colon_idx + 1] + ' ' + val

        lines.append(line)
    return '\n'.join(lines)


def _parse(text: str) -> ParsedScript:
    text = _preprocess_markdown(text)
    lines = [ln.rstrip() for ln in text.splitlines()]
    n = len(lines)
    i = 0

    # ── TÍTULO ────────────────────────────────────────────────────────────────
    title = ""
    while i < n:
        stripped = lines[i].strip()
        if re.match(r"^T[IÍ]TULO\s*:", stripped, re.IGNORECASE):
            raw_title = stripped.split(":", 1)[1].strip()
            # Quitar comillas tipográficas y rectas
            if (len(raw_title) >= 2
                    and raw_title[0] in ('"', *_OPEN_QUOTES)
                    and raw_title[-1] in ('"', *_CLOSE_QUOTES)):
                raw_title = raw_title[1:-1].strip()
            title = raw_title
            i += 1
            break
        i += 1

    # ── PERSONAJES ────────────────────────────────────────────────────────────
    characters: dict[str, Character] = {}
    while i < n:
        stripped = lines[i].strip()
        if stripped.upper() == "PERSONAJES:":
            i += 1
            while i < n:
                raw = lines[i]
                # Block ends when a non-indented line appears
                if raw and not raw[0].isspace():
                    break
                part = raw.strip()
                if ":" in part and part:
                    name, appearance = part.split(":", 1)
                    name = name.strip().upper()
                    characters[name] = Character(
                        name=name, appearance=appearance.strip()
                    )
                i += 1
            break
        i += 1

    # ── ESCENAS ───────────────────────────────────────────────────────────────
    scenes: list[Scene] = []

    while i < n:
        stripped = lines[i].strip()
        m = _SCENE_RE.match(stripped)
        if m:
            scene_num = int(m.group(1))
            i += 1
            background = ""
            dialogue: list[DialogueLine] = []

            while i < n:
                inner = lines[i].strip()

                # Next scene starts → close current
                if _SCENE_RE.match(inner):
                    break

                if re.match(r"^FONDO\s*:", inner, re.IGNORECASE):
                    background = inner.split(":", 1)[1].strip()

                elif ":" in inner and inner:
                    speaker, text = inner.split(":", 1)
                    speaker = speaker.strip().upper()
                    text = text.strip()
                    if text:
                        dialogue.append(
                            DialogueLine(
                                speaker=speaker,
                                text=text,
                                is_narration=(speaker == "NARRADOR"),
                            )
                        )
                i += 1

            scenes.append(
                Scene(number=scene_num, background=background, dialogue=dialogue)
            )
        else:
            i += 1

    return ParsedScript(title=title, characters=characters, scenes=scenes)
