THERMOS (Thermal Event Recognition & Monitoring Operational System) backend is built with **FastAPI**, **MongoDB Geospatial Indexing (`2dsphere`)**, **Scipy KD-Tree Feature Derivation Engine**, the **Trained XGBoost Classifier (99.4% accuracy)**, and a **RAG Disaster Intelligence Copilot**.

---

## ⚡ Quick Start Options

### Option 1: Run with Docker Compose (FastAPI + MongoDB + Nginx)

```bash
# Clone and start all services
docker-compose up --build -d

# Seed the database with 50+ Indian facilities & satellite hotspots
docker exec -it thermos-api python seed.py

# Check logs
docker-compose logs -f thermos-api
```
* **API Documentation (Swagger UI):** `http://localhost:8000/docs`
* **Health Check:** `http://localhost:8000/api/health`

---

### Option 2: Run Locally (Python 3.10+)

```bash
# 1. Navigate to ml directory
cd ml

# 2. Install dependencies
pip install -r requirements.txt

# 3. Seed MongoDB (or fallback in-memory store)
python seed.py

# 4. Start FastAPI server
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

For production, set `ENVIRONMENT=production`, a long random `THERMOS_API_KEY`,
the deployed API hostname in `TRUSTED_HOSTS`, and only the real frontend URL in
`CORS_ORIGINS`. Protected API requests must send `X-API-Key`. Do not put this
key in a browser frontend or a `VITE_` variable; browser code cannot keep a
shared API secret private. Use a server-side proxy or user authentication for
browser access.

---

## 🌐 Cloud Deployment Guide

### Deploying to Render.com (Free Tier)
1. Fork or push this repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) $\to$ **New Web Service**.
3. Select your repository.
4. **Environment:** Python 3
5. **Root Directory:** `.`
6. **Build Command:** `pip install -r ml/requirements.txt`
7. **Start Command:** `cd ml && uvicorn api.main:app --host 0.0.0.0 --port $PORT`
8. **Environment Variables:**
   - `MONGODB_URL`: Your MongoDB Atlas connection string (`mongodb+srv://...`)
   - `GEMINI_API_KEY`: *(Optional)* Your Google Gemini API Key

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | System health check (Model status, DB connectivity, Indexed facilities) |
| `GET` | `/api/anomalies` | **GeoJSON FeatureCollection** of classified thermal anomalies (supports `min_frp`, `classification`, `risk_level`) |
| `GET` | `/api/anomalies/{id}` | Detailed telemetry and facility association for a specific anomaly |
| `POST` | `/api/anomalies/ingest` | Ingests raw NASA FIRMS points, extracts 14 features, classifies, and saves to MongoDB |
| `GET` | `/api/facilities` | List of 50+ monitored Indian industrial facilities with hazardous materials |
| `GET` | `/api/facilities/nearby` | **Geospatial $near query** finding facilities within `max_distance_km` radius |
| `GET` | `/api/stats` | Aggregated metrics for dashboard charts (% Industrial vs Wildfire vs Agri, Total FRP) |
| `POST` | `/api/rag/chat` | Conversational AI Copilot for hazard analysis and SOP recommendations |
| `POST` | `/api/rag/incident-brief` | Generates NDMA/OSHA-compliant Tactical Incident Action Plan (IAP) |
| `POST` | `/api/predict` | Core 14-feature XGBoost inference endpoint |
| `POST` | `/api/predict_batch` | Batch 14-feature XGBoost inference endpoint |