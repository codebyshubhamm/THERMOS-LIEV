"""
Standalone Gemini API Isolation Test
Tests the exact GEMINI_API_KEY from backend-ml/Backend/.env against
Google Gemini generateContent endpoints and prints raw responses/errors.
"""
import os
import sys
from pathlib import Path
from dotenv import dotenv_values
import httpx

# Load exact GEMINI_API_KEY from .env
env_path = Path(__file__).resolve().parent.parent / ".env"
config = dotenv_values(env_path)
api_key = config.get("GEMINI_API_KEY", "").strip()

print("=" * 60)
print("THERMOS — GEMINI API ISOLATION TEST")
print(f"Env file checked: {env_path}")
print(f"GEMINI_API_KEY present: {bool(api_key)}")
print(f"Key length: {len(api_key)}")
print(f"Key prefix: {api_key[:6]}... (masked)")
print("=" * 60)

if not api_key:
    print("ERROR: GEMINI_API_KEY not found in .env")
    sys.exit(1)

models_to_test = [
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
]

test_prompt = "You are an Earth Observation specialist. Explain in 2 sentences why a satellite thermal anomaly with FRP 45MW and persistence 72h located in an industrial zone was classified as an Industrial Thermal Source."

for model in models_to_test:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [{"text": test_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 200
        }
    }
    print(f"\n--- Testing Model: {model} ---")
    print(f"Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
    try:
        resp = httpx.post(url, json=payload, timeout=15.0)
        print(f"HTTP Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                print(f"SUCCESS — Generated text:\n{text.strip()}")
            else:
                print("RAW JSON (no candidate parts):", data)
        else:
            print(f"FAILED — Raw error response:\n{resp.text[:400]}")
    except Exception as e:
        print(f"EXCEPTION: {e}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
