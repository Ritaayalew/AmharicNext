# AmharicNext

**Amharic predictive text and next-word suggestion app**, built on word n-gram language models trained on the full GPAC Amharic corpus.
NLP Assignment 1, Addis Ababa University, School of Information Technology and Engineering (Instructor: Fantahun Bogale Gereme, PhD).

## Group

| No. | Group Members | ID | Stream |
|---|---|---|---|
| 1 | Rita Ayalew | UGR/7639/15 | Software |
| 2 | Hawi Meonnen | UGR/5788/15 | Software |
| 3 | Ruhama Ristu | UGR/4614/15 | Software |
| 4 | Ribka Mengiste | UGR/9680/15 | Software |
| 2 | Lidia Asamnew | UGR/2984/15 | Software |

## Links

| What | Link |
|---|---|
| Google Colab notebook (Tasks 1 to 3: n-grams, evaluation) | https://colab.research.google.com/drive/1YdHCSHFvyQ9W4U9TE_7VSNLbKfZY8TAf |
| Demo video (Google Drive) | https://drive.google.com/file/d/1tXnMVtyf5vJOOvxI7Z9wXX1JWudHsAP6/view?usp=sharing |
| Model files (required to run the backend) | https://drive.google.com/file/d/18sJc-dC-lnkSbvAbtz9rRcX9qB3Pxjbn/view?usp=sharing |

## About

Type an incomplete Amharic sentence and the app suggests the **top 5 next words with their probabilities**. Tap a suggestion to add it and keep writing.

**How it works**
- Word n-gram models (n = 1 to 4) trained on the cleaned GPAC corpus (about 60.9M training tokens, 3.99M sentences, 65,000-word vocabulary; rarer words become `<UNK>`).
- Suggestions combine all four orders by **interpolation with backoff**: a word seen after the last three words (4-gram) is trusted most, and the model falls back to shorter contexts when the long one was never seen.
- The last three typed words are used as context. `።`, `፧`, `?` and `!` start a new sentence. Input is normalized like the training data (homophone letters merged, non-Ethiopic characters removed).

**App features**
- Top-5 suggestions with probability bars, tap to append, animated chips, light and dark theme
- Type in Latin letters and get Ge'ez (`selam` becomes ሰላም), with a punctuation helper (`.` becomes `።`)
- Copy and Share buttons, friendly message when the server is unreachable

**Results** (20,000 test positions, fixed seed, accuracy on in-vocabulary targets only; "novel" means test sentences that do not appear word for word in training)

| Model | Size | Top-1 | Top-3 | Top-5 (novel text) |
|---|---|---|---|---|
| Full (served by default) | 1.2 GB | 23.9% | 31.4% | 34.9% |
| Lite (`serving/default`) | 296 MB | 14.6% | 21.6% | 24.9% |

On all test positions, including sentences duplicated in training (about 18%), the full model reaches 42.7% top-5. Details are in `App/docs/phase0_report.md`.

## Repository layout

```
App/
  backend/   FastAPI service + n-gram engine, export and evaluation scripts
  mobile/    Expo (React Native, TypeScript) app
```

## Quick setup

**You need:** Python via [uv](https://docs.astral.sh/uv/), Node.js (LTS), the **Expo Go** app on an Android phone, and the phone and laptop on the **same Wi-Fi**.

### 1. Get the model files (not in git, too large)

Download the model folder from the Google Drive link above and unzip it so you end up with:

```
App/backend/serving/full/manifest.json      # full model (about 1.2 GB), used by default
App/backend/serving/default/manifest.json   # optional lite model (about 296 MB)
```

The `serving/` folder must contain these model folders. You do not need the raw Colab tables (`model_artifacts/`) unless you want to rebuild the model (see `App/backend/README.md`).

### 2. Run the backend

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # once, installs uv
cd App/backend
uv sync
uv run python app.py                              # serves on 0.0.0.0:8000 and prints your LAN URL
```

Check it: `curl http://localhost:8000/health` should return `{"status":"ok","model":"full","vocab":65000}`.
To use the lite model: `AMHARICNEXT_MODEL_DIR=serving/default uv run python app.py`.
Tests: `uv run pytest -q`.

### 3. Run the mobile app

```bash
cd App/mobile
npm install
cp .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_API_URL=http://<laptop-ip>:8000`, using the laptop's Wi-Fi IP (`hostname -I`). `localhost` does not work from a phone.

```bash
npx expo start -c
```

Open Expo Go on the phone and scan the QR code. If Expo cannot connect on your network, use `npx expo start --tunnel` (the backend still needs the LAN IP in `.env`).

### Troubleshooting

| Problem | Fix |
|---|---|
| App says it can't reach the server | Backend not running, laptop IP changed (`hostname -I`), or different Wi-Fi. Update `.env`, then `npx expo start -c` |
| Port 8000 already in use | An old backend is still running: `fuser -k 8000/tcp`, then start again |
| Backend can't find the model | Check that `App/backend/serving/full/manifest.json` exists |
| Phone can't open the laptop's address | Allow the port (`sudo ufw allow 8000`) or use your phone's hotspot |
| Expo asks you to sign in | `npx expo logout` on the laptop (an Expo account is not needed) |
