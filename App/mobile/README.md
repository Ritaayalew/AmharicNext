# AmharicNext mobile app

## Install

```bash
cd App/mobile
npm install
```

Install **Expo Go** on your Android phone from the Play Store.

## Set the API URL

```bash
cp .env.example .env
```

Edit `.env` and replace `<laptop-ip>` with your laptop's Wi-Fi IP (the backend prints it at startup,
or run `hostname -I`). `localhost` does not work on a phone. The phone and laptop must be on the same
Wi-Fi. Restart `npx expo start` after changing `.env`.

## Run with Expo Go

1. Start the backend: `cd App/backend && uv run python app.py`
2. Start the app: `cd App/mobile && npx expo start`
3. Open Expo Go on the phone and scan the QR code shown in the terminal.

If the phone can't connect to Expo (some networks block it), use `npx expo start --tunnel`.
The backend still needs the LAN IP in `.env`.
