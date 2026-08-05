"""
Checks if Gemini image generation API is available.
If it works, generates a cat image and creates a GitHub issue.
"""
import os
import base64
import json
import requests
import sys

API_KEY = os.environ["GEMINI_API_KEY"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GITHUB_REPO = os.environ["GITHUB_REPOSITORY"]

PROMPT = (
    "A cute cartoon cat in manga/anime style, sitting and smiling, "
    "with a big manga-style thought bubble above its head that says exactly: "
    "'...ya funcionó el MPC de generación de imágenes yuhuu!!!' "
    "The cat looks super happy and excited. White background. Colorful."
)

MODELS = [
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
]


def try_generate(model: str) -> bytes | None:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
    }
    try:
        r = requests.post(url, json=payload, timeout=90)
        if r.status_code != 200:
            print(f"  {model}: HTTP {r.status_code}")
            return None
        data = r.json()
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"])
        print(f"  {model}: respondió pero sin imagen")
    except Exception as e:
        print(f"  {model}: error — {e}")
    return None


API = "https://api.github.com"

# La imagen NO va a `main`: esa rama exige el status check "build" con enforce_admins,
# así que cualquier escritura directa (git push o Contents API) es rechazada — la Contents API
# devolvía HTTP 409 Conflict y este workflow falló los 3 domingos seguidos (12, 19 y 26-jul).
# Se sube a una rama dedicada SIN protección, que sirve igual para embeber la imagen en el issue.
ASSETS_BRANCH = "nanobanana-assets"

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}


def _fallar_con_detalle(r, contexto: str):
    """raise_for_status() a secas esconde el motivo; GitHub lo explica en el body."""
    if r.status_code >= 400:
        print(f"  ✗ {contexto}: HTTP {r.status_code} — {r.text[:400]}")
        r.raise_for_status()


def asegurar_rama_de_assets():
    """Crea la rama de assets si no existe todavía, partiendo de main."""
    r = requests.get(f"{API}/repos/{GITHUB_REPO}/git/ref/heads/{ASSETS_BRANCH}", headers=HEADERS)
    if r.status_code == 200:
        return
    if r.status_code != 404:
        _fallar_con_detalle(r, f"consultando la rama {ASSETS_BRANCH}")

    print(f"  La rama {ASSETS_BRANCH} no existe: creándola desde main…")
    r = requests.get(f"{API}/repos/{GITHUB_REPO}/git/ref/heads/main", headers=HEADERS)
    _fallar_con_detalle(r, "obteniendo el sha de main")
    sha_main = r.json()["object"]["sha"]

    r = requests.post(
        f"{API}/repos/{GITHUB_REPO}/git/refs",
        headers=HEADERS,
        json={"ref": f"refs/heads/{ASSETS_BRANCH}", "sha": sha_main},
    )
    _fallar_con_detalle(r, f"creando la rama {ASSETS_BRANCH}")


def upload_image_to_repo(image_bytes: bytes) -> str:
    """Sube la imagen a la rama de assets y retorna su URL raw."""
    asegurar_rama_de_assets()

    path = ".github/nanobanana/success.png"
    url = f"{API}/repos/{GITHUB_REPO}/contents/{path}"

    # El sha del archivo se pide EN esa rama: si se omite el ?ref, GitHub responde con el de
    # main y el PUT falla con 409 por sha desactualizado.
    sha = None
    r = requests.get(url, headers=HEADERS, params={"ref": ASSETS_BRANCH})
    if r.status_code == 200:
        sha = r.json().get("sha")

    payload = {
        "message": "chore: nanobanana weekly check - image generation working!",
        "content": base64.b64encode(image_bytes).decode(),
        "branch": ASSETS_BRANCH,
    }
    if sha:
        payload["sha"] = sha

    r = requests.put(url, headers=HEADERS, json=payload)
    _fallar_con_detalle(r, "subiendo la imagen")

    return f"https://raw.githubusercontent.com/{GITHUB_REPO}/{ASSETS_BRANCH}/{path}"


def create_github_issue(model: str, image_url: str):
    url = f"{API}/repos/{GITHUB_REPO}/issues"
    headers = HEADERS
    body = (
        f"## 🎉 NanoBanana ya funciona!\n\n"
        f"El modelo **`{model}`** ya genera imágenes vía API key gratuita.\n\n"
        f"Podés activarlo en Claude Code y usar la restauración de fotos.\n\n"
        f"![Cat celebrating]({image_url})\n\n"
        f"---\n"
        f"*Detectado automáticamente por el workflow `check-nanobanana`*"
    )
    payload = {
        "title": "✅ NanoBanana image generation ya está disponible!",
        "body": body,
        "labels": [],
    }
    r = requests.post(url, headers=headers, json=payload)
    _fallar_con_detalle(r, "creando el issue")
    print(f"Issue creado: {r.json()['html_url']}")


def main():
    print("Probando modelos de generación de imágenes Gemini...")
    image_bytes = None
    working_model = None

    for model in MODELS:
        print(f"Probando {model}...")
        image_bytes = try_generate(model)
        if image_bytes:
            working_model = model
            print(f"  ✅ Funciona con {model}!")
            break

    if not image_bytes:
        print("❌ Ningún modelo disponible todavía. Hasta el próximo domingo.")
        sys.exit(0)

    print("Subiendo imagen al repo...")
    image_url = upload_image_to_repo(image_bytes)

    print("Creando GitHub issue...")
    create_github_issue(working_model, image_url)

    print("Todo listo!")


if __name__ == "__main__":
    main()
