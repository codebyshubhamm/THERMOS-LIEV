# 🧠 `ai/`: THERMOS Unified AI & RAG Disaster Intelligence Module

This folder (`ai/`) contains the complete, standalone Artificial Intelligence, Spatial Feature Extraction, and Retrieval-Augmented Generation (RAG) engine for **SIH Problem Statement 26162**, integrated directly with the FastAPI backend.

---

## 📂 Folder Structure

```text
ai/
├── __init__.py                  # Unified package exports
├── spatial_engine.py            # 14-Feature Scipy KD-Tree Geospatial Engine
├── classifier.py                # 99.4% Accurate XGBoost Multi-Class Classifier
├── copilot.py                   # RAG Disaster Intelligence & Hazmat Copilot
├── api_router.py                # FastAPI Router (/api/ai/*)
├── models/
│   ├── xgboost_classifier.pkl   # Trained XGBoost model weights
│   ├── label_encoders.pkl       # Categorical & class encoders
│   └── model_metadata.json      # Feature importance & evaluation metrics
└── knowledge/
    ├── industrial_facilities.json # 50+ Indian Major Accident Hazard (MAH) Complexes
    └── hazmat_sop_kb.json         # Chemical MSDS Profiles & NDMA Fire SOPs
```

---

## 🛠️ Technologies & Libraries Used

| Category | Technology / Tool | Purpose in `ai/` |
| :--- | :--- | :--- |
| **Machine Learning** | **XGBoost (`xgboost`)** | 6-class segregation (`Industrial Fire`, `Gas Flare`, `Thermal Source`, `Mining`, `Wildfire`, `Agri-Burn`) with **99.40% test accuracy**. |
| **Geospatial Indexing** | **Scipy Spatial (`cKDTree`)** | Microsecond proximity distance calculations to refineries, mines, forests, and croplands. |
| **Spherical Math** | **Haversine Formula & NumPy** | Exact geodesic kilometer calculations on WGS84 Earth coordinates. |
| **RAG & LLM Copilot** | **Google Gemini 1.5 Flash + Local Knowledge Base** | Synthesizes Tactical Incident Action Plans (IAPs) from chemical MSDS and NDMA SOPs with offline failsafe. |
| **API Layer** | **FastAPI & Pydantic v2** | Exposes `/api/ai/analyze`, `/api/ai/chat`, and `/api/ai/status`. |

---

## 🚀 API Endpoints Provided

1. **`POST /api/ai/analyze`**
   * **Single-Call End-to-End Pipeline:** Takes raw `(latitude, longitude, frp_mw, brightness_k)` $\to$ Computes all 14 geospatial features $\to$ Runs XGBoost classification $\to$ Generates the RAG Tactical Incident Brief.
2. **`POST /api/ai/chat`**
   * **RAG Copilot:** Answers questions on chemical hazards, evacuation radii, and fire suppression protocols.
3. **`GET /api/ai/status`**
   * Returns module health, model accuracy, and indexed facility count.
