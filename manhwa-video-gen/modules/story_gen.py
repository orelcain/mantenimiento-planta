"""
story_gen.py — Genera guiones manhwa desde una idea de 1 línea usando IA.

Backends soportados
───────────────────
  ollama    — 100% local, sin costo, sin internet (requiere Ollama corriendo)
  gemini    — Google Gemini Flash, gratis 1500 req/día (requiere GEMINI_API_KEY)
  anthropic — Claude Haiku/Sonnet, ~$0.001/historia (requiere ANTHROPIC_API_KEY)

Uso vía main.py
───────────────
  python main.py --idea "una chica descubre poderes en Seúl" --genre fantasia
  python main.py --idea "rivales en un piso compartido" --genre romance --backend gemini
  python main.py --idea "detective en Seúl 1920" --genre accion --compare-backends

Jurado evaluador
────────────────
  --compare-backends genera con los 3 backends, el jurado (Ollama o Gemini)
  califica cada guion y elige el mejor automáticamente.
"""

import json
import os
import re
import textwrap
from pathlib import Path


# ── Tonos por género ──────────────────────────────────────────────────────────

_GENRE_TONE: dict[str, str] = {
    "romance": (
        "tono: bittersweet y tierno, tensión emocional lenta, miradas largas, "
        "sentimientos no dichos, paletas de color suaves (rosas, dorados, cerezos). "
        "El diálogo revela carácter por contención — lo que no se dice importa."
    ),
    "accion": (
        "tono: cinético y urgente, confrontaciones de alto riesgo, diálogo corto y contundente, "
        "iluminación dramática (sombras profundas, neón, fuego). "
        "Cada escena debe sentirse como un golpe en una pelea o persecución."
    ),
    "fantasia": (
        "tono: mítico y lleno de asombro, secretos ancestrales, poderes que despiertan, "
        "entornos de otro mundo (ruinas flotantes, bosques luminosos, reinos espirituales). "
        "Los personajes enfrentan elecciones entre destino y deseo."
    ),
    "horror": (
        "tono: dread e inquietud, algo que está mal, percepción poco confiable, "
        "atmósferas opresivas (pasillos en ruinas, niebla lunar, espejos). "
        "El diálogo es escaso; lo que los personajes ven desafía toda explicación."
    ),
    "auto": "",
}

# ── System prompt de generación ───────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent("""\
    Eres director creativo de una serie de videos manhwa (novela gráfica coreana)
    en ESPAÑOL para YouTube. Tu trabajo: transformar una idea de una línea en un
    guion completo listo para producción en un pipeline automático de video.

    ═══════════════════════════════════════════════════════
    FORMATO DE SALIDA — seguirlo EXACTAMENTE, sin variaciones
    ═══════════════════════════════════════════════════════

    TÍTULO: <título en español, evocador y corto>

    PERSONAJES:
      <NOMBRE>: <apariencia física — optimizada para Stable Diffusion XL>
      (repetir para cada personaje nombrado, máximo 4)

    ESCENA 1
    FONDO: <descripción del entorno — estilo prompt SDXL, sin nombres de personajes>
    NARRADOR: <línea de narración atmosférica — 1 oración>
    <PERSONAJE>: <línea de diálogo>
    (más diálogos según sea necesario)

    ESCENA 2
    ...

    ═══════════════════════════════════════════════════════
    REGLAS OBLIGATORIAS
    ═══════════════════════════════════════════════════════

    NOMBRES: siempre en MAYÚSCULAS en el cuerpo del guion.
    NARRADOR: solo para narración atmosférica, no para diálogos de personajes.
    FONDO: prompt estilo Stable Diffusion XL:
        - etiquetas descriptivas separadas por comas
        - iluminación, hora del día, estado de ánimo, estilo (manhwa, webtoon)
        - SIN nombres de personajes ni acciones — solo ambiente/escenario
        Ejemplo: "azotea moderna de Seúl al atardecer, luces de la ciudad abajo,
        cielo naranja-morado dramático, estilo manhwa, encuadre cinematográfico"
    APARIENCIA EN PERSONAJES:
        - Describir exactamente una vez; el pipeline la reutiliza en cada escena
        - Tags válidos para SDXL: "mujer coreana 20 años, cabello negro largo liso,
          ojos grises, uniforme escolar blanco y azul marino, piel pálida"
        - Ser específico — es el 'lock' visual del personaje
    DIÁLOGOS: naturales, guiados por el personaje, nunca expositivos. TODO en español.
    RITMO: 2–4 líneas de diálogo por escena (sin contar NARRADOR).
    CONTINUIDAD: referencias sutiles a escenas anteriores para dar momentum.

    NO incluir: markdown, negritas, texto fuera del formato, inglés en diálogos.
""")

# ── Prompt del jurado evaluador ───────────────────────────────────────────────

_JUDGE_PROMPT = textwrap.dedent("""\
    Eres un crítico experto en webtoons y manhwa para YouTube en español.
    Evaluarás {n} guiones generados a partir de la misma idea, y elegirás el mejor.

    Califica cada guion del 1 al 10 en estos criterios:
    - GANCHO (hook de la primera escena, ¿engancha al espectador?)
    - EMOCIÓN (¿los diálogos generan sentimientos reales?)
    - VISUALES (¿los FONDO son descriptivos y cinematográficos para IA?)
    - RITMO (¿las escenas tienen buen flujo y variedad?)
    - ORIGINALIDAD (¿la historia evita clichés o los usa de forma fresca?)

    Idea original: {idea}
    Género: {genre}

    {scripts_block}

    Responde ÚNICAMENTE con este JSON (sin markdown, sin explicaciones extra):
    {{
      "evaluaciones": [
        {{
          "backend": "nombre_backend",
          "gancho": 8,
          "emocion": 7,
          "visuales": 9,
          "ritmo": 8,
          "originalidad": 7,
          "total": 39,
          "resumen": "Una frase sobre por qué este guion destaca o falla"
        }}
      ],
      "ganador": "nombre_backend",
      "razon": "Por qué este guion es el mejor en 2-3 oraciones"
    }}
""")


# ── API pública ───────────────────────────────────────────────────────────────

def generate_story(
    idea: str,
    genre: str = "auto",
    num_scenes: int = 6,
    output_path: Path | None = None,
    backend: str = "ollama",
    model: str | None = None,
    api_key: str | None = None,
) -> Path:
    """
    Genera un guion manhwa en español a partir de una idea de una línea.

    Returns:
        Path al archivo .txt del guion guardado.
    """
    genre = genre.lower()
    if genre not in _GENRE_TONE:
        print(f"  [WARN] Género '{genre}' desconocido, usando 'auto'")
        genre = "auto"

    genre_txt = f"\nGénero / tono: {_GENRE_TONE[genre]}" if _GENRE_TONE.get(genre) else ""
    user_prompt = (
        f"Idea de historia: {idea}\n"
        f"Número de escenas: {num_scenes}{genre_txt}\n\n"
        "Genera el guion completo siguiendo el formato exacto. "
        "Hacerlo emocionalmente atractivo, visualmente rico y listo para producción. "
        "TODO en español."
    )

    print(f"  Backend : {backend}")
    print(f"  Idea    : {idea}")
    print(f"  Género  : {genre}  |  Escenas: {num_scenes}")

    # ── Generar con retry si el modelo no produce escenas válidas ────────────
    MAX_RETRIES = 2
    current_prompt = user_prompt
    script_text = ""
    for attempt in range(MAX_RETRIES + 1):
        raw = _dispatch(backend, current_prompt, model, api_key)
        script_text = _clean_llm_output(raw)
        if _count_scenes(script_text) > 0:
            break
        if attempt < MAX_RETRIES:
            print(
                f"  [RETRY {attempt + 1}/{MAX_RETRIES}] Sin escenas en el output "
                f"— reintentando con prompt reforzado..."
            )
            current_prompt = (
                "IMPORTANTE: Tu respuesta anterior no incluyó bloques ESCENA. "
                "Debes generar exactamente el formato indicado: ESCENA 1, ESCENA 2, etc. "
                "SIN markdown, SIN negritas, SIN asteriscos. Sigue el formato EXACTAMENTE.\n\n"
                + user_prompt
            )

    _validate_script(script_text, num_scenes)

    if output_path is None:
        slug = _to_slug(idea)
        scripts_dir = Path(__file__).parent.parent / "scripts"
        scripts_dir.mkdir(exist_ok=True)
        output_path = scripts_dir / f"{slug}_{backend}.txt"

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(script_text, encoding="utf-8")
    print(f"  Guardado: {output_path}")
    return output_path


def compare_and_judge(
    idea: str,
    genre: str = "auto",
    num_scenes: int = 4,
    backends: list[str] | None = None,
    judge_backend: str | None = None,
) -> Path:
    """
    Genera la misma historia con múltiples backends, la evalúa con un jurado IA
    y devuelve el Path al guion ganador.

    El jurado usa el primer backend disponible (ollama → gemini → anthropic).

    Returns:
        Path al guion ganador.
    """
    if backends is None:
        backends = ["ollama", "gemini", "anthropic"]

    print(f"\n{'═'*60}")
    print(f"  GENERANDO CON {len(backends)} BACKENDS")
    print(f"  Idea: {idea}")
    print(f"{'═'*60}")

    generated: dict[str, Path] = {}
    for b in backends:
        print(f"\n── [{b.upper()}] ─────────────────────────────────────")
        try:
            path = generate_story(idea=idea, genre=genre, num_scenes=num_scenes, backend=b)
            generated[b] = path
        except Exception as exc:
            print(f"  ✗ {b} falló: {exc}")

    if not generated:
        raise RuntimeError("Todos los backends fallaron. Verificá la configuración.")

    if len(generated) == 1:
        winner_backend = next(iter(generated))
        print(f"\n  Solo un backend disponible: {winner_backend}")
        return generated[winner_backend]

    # ── Jurado evaluador ──────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print("  JURADO EVALUANDO GUIONES...")
    print(f"{'─'*60}")

    scripts_block = ""
    for b, path in generated.items():
        content = path.read_text(encoding="utf-8")
        scripts_block += f"\n--- GUION [{b.upper()}] ---\n{content}\n"

    judge_prompt = _JUDGE_PROMPT.format(
        n=len(generated),
        idea=idea,
        genre=genre,
        scripts_block=scripts_block,
    )

    # Usar el primer backend disponible como jurado
    jb = judge_backend or next(iter(generated))
    print(f"  Jurado: {jb}")
    try:
        verdict_raw = _dispatch(jb, judge_prompt, None, None)
        verdict = _parse_json(verdict_raw)
    except Exception as exc:
        print(f"  [WARN] El jurado falló ({exc}), seleccionando el primero")
        winner_backend = next(iter(generated))
        _print_winner(winner_backend, generated[winner_backend], None)
        return generated[winner_backend]

    # Mostrar resultados del jurado
    _print_verdict(verdict)

    winner_backend = verdict.get("ganador", next(iter(generated)))
    if winner_backend not in generated:
        print(f"  [WARN] Ganador '{winner_backend}' no encontrado, usando el primero")
        winner_backend = next(iter(generated))

    winner_path = generated[winner_backend]

    # Copiar ganador como el script final (sin sufijo _backend)
    final_path = winner_path.parent / f"{_to_slug(idea)}.txt"
    import shutil
    shutil.copy(winner_path, final_path)
    print(f"\n  GANADOR: {winner_backend.upper()} → {final_path.name}")

    return final_path


# ── Dispatch de backends ──────────────────────────────────────────────────────

def _dispatch(backend: str, prompt: str, model: str | None, api_key: str | None) -> str:
    if backend == "ollama":
        return _call_ollama(prompt, model or "llama3.2:3b")
    elif backend == "gemini":
        return _call_gemini(prompt, model or "gemini-1.5-flash", api_key)
    elif backend == "anthropic":
        return _call_anthropic(prompt, model or "claude-haiku-4-5", api_key)
    else:
        raise ValueError(f"Backend desconocido: '{backend}'")


def _call_ollama(prompt: str, model: str) -> str:
    import requests  # type: ignore
    base = "http://localhost:11434"

    # ── Pre-flight: verificar que Ollama corre y tiene el modelo ─────────────
    try:
        tags = requests.get(f"{base}/api/tags", timeout=5).json()
        available = [m["name"] for m in tags.get("models", [])]
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            "Ollama no está corriendo.\n"
            "  Ejecutá: run_ollama.bat  (o: set OLLAMA_MODELS=D:\\.ollama\\models && ollama serve)"
        )
    except Exception:
        available = []

    # El modelo puede listarse como "llama3.2:3b" o "llama3.2:3b-..."
    model_found = any(m.split(":")[0] == model.split(":")[0] for m in available)
    if not model_found:
        if available:
            raise RuntimeError(
                f"Modelo '{model}' no disponible en Ollama.\n"
                f"  Modelos disponibles: {', '.join(available)}\n"
                f"  Para descargarlo: ollama pull {model}\n"
                f"  Si ya está descargado en D:\\.ollama\\models, reiniciá Ollama con run_ollama.bat"
            )
        else:
            raise RuntimeError(
                f"Ollama no tiene modelos cargados.\n"
                f"  1. Cerrá Ollama y ejecutá: run_ollama.bat\n"
                f"  2. O descargá el modelo: ollama pull {model}"
            )

    payload = {
        "model": model,
        "prompt": f"{_SYSTEM_PROMPT}\n\n---\n\n{prompt}",
        "stream": False,
        "options": {"temperature": 0.8, "num_predict": 2048},
    }
    print(f"  Llamando a Ollama ({model})...")
    try:
        resp = requests.post(f"{base}/api/generate", json=payload, timeout=360)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"Ollama error: {data['error']}")
        return data["response"]
    except requests.exceptions.ReadTimeout:
        raise RuntimeError(
            f"Ollama tardó más de 6 minutos generando con '{model}'.\n"
            "  Puede que la máquina esté sobrecargada o el modelo no esté en RAM.\n"
            "  Intentá cerrar otras apps y volver a correr."
        )
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Ollama se desconectó durante la generación. Reiniciá con run_ollama.bat")


def _call_gemini(prompt: str, model: str, api_key: str | None) -> str:
    key = api_key or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise ValueError(
            "GEMINI_API_KEY no configurada.\n"
            "  Obtené una gratis: https://aistudio.google.com/apikey\n"
            "  Luego: setx GEMINI_API_KEY tu-clave"
        )
    try:
        import google.generativeai as genai  # type: ignore
    except ImportError:
        raise ImportError("pip install google-generativeai")
    genai.configure(api_key=key)
    gm = genai.GenerativeModel(model_name=model, system_instruction=_SYSTEM_PROMPT)
    print(f"  Llamando a Gemini ({model})...")
    resp = gm.generate_content(prompt, generation_config={"max_output_tokens": 2048, "temperature": 0.8})
    return resp.text


def _call_anthropic(prompt: str, model: str, api_key: str | None) -> str:
    key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError(
            "ANTHROPIC_API_KEY no configurada.\n"
            "  Creá una: https://console.anthropic.com/api-keys\n"
            "  Luego: setx ANTHROPIC_API_KEY tu-clave"
        )
    try:
        import anthropic  # type: ignore
    except ImportError:
        raise ImportError("pip install anthropic")
    print(f"  Llamando a Anthropic ({model})...")
    client = anthropic.Anthropic(api_key=key)
    msg = client.messages.create(
        model=model, max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    print(f"  Tokens: {msg.usage.input_tokens} in / {msg.usage.output_tokens} out")
    return msg.content[0].text


# ── Helpers del jurado ────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Extrae el primer bloque JSON del texto de respuesta."""
    # Algunos modelos envuelven en ```json ... ```
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("El jurado no devolvió JSON válido")
    return json.loads(match.group())


def _print_verdict(verdict: dict) -> None:
    print(f"\n{'─'*60}")
    print("  RESULTADOS DEL JURADO")
    print(f"{'─'*60}")
    for ev in verdict.get("evaluaciones", []):
        b = ev.get("backend", "?")
        total = ev.get("total", "?")
        resumen = ev.get("resumen", "")
        gancho = ev.get("gancho", "-")
        emocion = ev.get("emocion", "-")
        visuales = ev.get("visuales", "-")
        ritmo = ev.get("ritmo", "-")
        orig = ev.get("originalidad", "-")
        print(f"\n  [{b.upper()}]  Total: {total}/50")
        print(f"    Gancho:{gancho}  Emoción:{emocion}  Visuales:{visuales}  Ritmo:{ritmo}  Originalidad:{orig}")
        print(f"    → {resumen}")
    razon = verdict.get("razon", "")
    if razon:
        print(f"\n  VEREDICTO: {razon}")


def _print_winner(backend: str, path: Path, verdict: dict | None) -> None:
    print(f"\n  GANADOR: {backend.upper()} → {path.name}")


# ── Validación y utilidades ───────────────────────────────────────────────────

# Comillas tipográficas comunes en output de LLMs
_OQ = ('"', '\u201c', '\u00ab')   # " « "
_CQ = ('"', '\u201d', '\u00bb')   # " » "


def _clean_llm_output(text: str) -> str:
    """Normaliza el output crudo de cualquier LLM al formato plain-text del parser.

    Transforma:
      **TÍTULO:** "Mi Historia"   →  TÍTULO: Mi Historia
      **ESCENA 1**                →  ESCENA 1
      * **AKIRA**: descripción    →    AKIRA: descripción
      NARRADOR: "texto"           →  NARRADOR: texto
      AKIRA: (en voz baja) "txt"  →  AKIRA: txt
      Nota final del modelo…      →  (eliminada)
    """
    lines = []
    for line in text.splitlines():
        # 1. Bullet → 2-space indent (para bloque PERSONAJES)
        m = re.match(r'^(\s*)[*\-•]\s+(.*)', line)
        if m:
            line = (m.group(1) or '  ') + m.group(2)

        # 2. **negrita** → texto plano
        line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)

        # 3. Limpiar valor después de ":"
        colon_idx = line.find(':')
        if colon_idx > 0:
            key = line[:colon_idx].strip()
            val = line[colon_idx + 1:].strip()
            if val:
                # Stage direction (solo en líneas de hablante: clave toda en mayúsculas, sin espacios)
                if key.upper() == key and ' ' not in key and key not in ('FONDO',):
                    val = re.sub(r'^\s*\([^)]*\)\s*', '', val)
                # Quitar comillas tipográficas y rectas envolventes
                if len(val) >= 2 and val[0] in (*_OQ, '"') and val[-1] in (*_CQ, '"'):
                    val = val[1:-1].strip()
                line = line[:colon_idx + 1] + ' ' + val

        lines.append(line)

    # 4. Eliminar comentario final del modelo (texto en prosa sin ":")
    while lines:
        last = lines[-1].strip()
        if (last
                and ':' not in last
                and len(last) > 60
                and not re.match(r'^(?:ESCENA|TITULO|TÍTULO)\s', last, re.IGNORECASE)):
            lines.pop()
        else:
            break

    return '\n'.join(lines).strip()


def _count_scenes(text: str) -> int:
    return len(re.findall(r"^ESCENA\s+\d+", text, re.MULTILINE | re.IGNORECASE))


def _validate_script(text: str, expected_scenes: int) -> None:
    found = _count_scenes(text)
    if found == 0:
        print("  [WARN] Sin bloques ESCENA detectados.")
    elif found != expected_scenes:
        print(f"  [WARN] Esperadas {expected_scenes} escenas, generadas {found}.")
    if not re.search(r"^T[IÍ]TULO\s*:", text, re.MULTILINE | re.IGNORECASE):
        print("  [WARN] Sin línea TÍTULO.")


def _to_slug(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    slug = re.sub(r"[\s_]+", "_", slug).strip("_")
    return slug[:max_len] or "historia"
