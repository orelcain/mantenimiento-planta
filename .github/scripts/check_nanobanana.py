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


def upload_image_to_repo(image_bytes: bytes) -> str:
    """Sube la imagen al repo via GitHub API y retorna la URL raw."""
    path = ".github/nanobanana/success.png"
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
    # Verificar si ya existe (para obtener el sha)
    sha = None
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        sha = r.json().get("sha")

    payload = {
        "message": "chore: nanobanana weekly check - image generation working!",
        "content": base64.b64encode(image_bytes).decode(),
    }
    if sha:
        payload["sha"] = sha

    r = requests.put(url, headers=headers, json=payload)
    r.raise_for_status()
    branch = r.json()["content"]["download_url"].split("/raw/")[1].split("/")[0]
    raw_url = (
        f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/{path}"
    )
    return raw_url


def create_github_issue(model: str, image_url: str):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
    }
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
    r.raise_for_status()
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
