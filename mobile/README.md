# Android and iPhone apps

This shared Expo SDK 58 / React Native app uses the existing Flask API. No database migrations or production changes are required.

## Run

Install a current Node.js LTS version supported by Expo SDK 58 and npm. From this directory:

```sh
npm ci
cp .env.example .env
# Edit EXPO_PUBLIC_API_URL in .env
npm start
```

On Windows, copy `.env.example` to `.env` using your editor or `Copy-Item`. Scan the QR code with a compatible Expo Go version. If SDK 58 is not available in your Expo Go, use a development build. Start the backend using the repository root README.

The Docker Compose frontend proxies Flask under `/api`: use `http://10.0.2.2/api` in Android Emulator, your computer's LAN IP such as `http://192.168.1.20/api` on a physical phone, or `http://localhost/api` in iOS Simulator on the same Mac. Direct Flask access uses port 5000 without `/api`. A phone's localhost refers to the phone. Permit local traffic through your firewall as needed. Restart Expo after changing `.env`.

Use HTTPS for installed builds; native platform policies may block cleartext LAN traffic. EXPO_PUBLIC values are bundled into the app: include only the public API URL, never database credentials or JWT secrets. Use a development database and test account for acceptance testing.

## API coverage

| Feature | Endpoint |
| --- | --- |
| Register / sign in | POST /register, /login |
| Profile / session restoration | GET /profile |
| Profile photo | POST /profile/picture (multipart `picture`) |
| Dashboard balances | GET /accounts/summary |
| Transaction list / create | GET /expenses, POST /expenses |
| Transaction edit / delete | PUT /expenses/:id, DELETE /expenses/:id |
| Savings goal / history | GET /savings |
| Create / update goal | POST /savings/goal |
| Record manual saving | POST /savings/deposit |

Tokens are stored in Expo SecureStore. Expired/rejected authenticated tokens clear the session. The API has no refresh or revocation endpoint; users sign in again after expiry, and logout removes local credentials. Records are kept in memory with pull to refresh. There is no offline write queue or automatic mutation retry. After a timeout, refresh history before repeating a save because the API has no idempotency keys.

NGN and USD stay separate in dashboard and savings balances. The API goal has no currency and its aggregate progress adds currencies together. This app shows the goal target and separate balances without displaying combined monetary progress. Savings deposits record money saved elsewhere; they do not transfer money. Password reset, account deletion and profile text changes have no API endpoints. Those need backend work before release if required by product/store policies. Flask accepts JPG, JPEG, PNG and WEBP photos with a 5 MB request limit.

## Checks

```sh
npm test
npx expo install --check
npx expo export --platform android --output-dir dist/android
npx expo export --platform ios --output-dir dist/ios
# Repository root, after installing backend/requirements.txt:
python -m unittest discover -s backend -p 'test_*.py' -v
```

## Build packages

Confirm you own the app identifiers in `app.json`. Install EAS CLI and link an Expo project you own:

```sh
npm install --global eas-cli
eas login
eas init
```

Configure EXPO_PUBLIC_API_URL with your approved HTTPS staging API in the EAS environment used by the build. EAS uploads source and requires an Expo account; cloud builds may incur charges. No cloud build or store submission is run automatically.

```sh
# Internal Android APK
eas build --platform android --profile preview
# iOS Simulator (runs on a Mac with Xcode)
eas build --platform ios --profile simulator
# Physical iPhone: Apple developer signing and registered device required
eas device:create
eas build --platform ios --profile preview
```

Local builds use `npx expo run:android` with Android Studio/JDK, or `npx expo run:ios` on macOS with Xcode. Generated native projects are ignored. The production profile prepares an Android app bundle or signed iOS build when authorized. No automatic store submission is configured. Obtain approval before production deployment or store publishing. Do not push to main: this repository deploys production on main pushes.

## Device acceptance

Before release, test Android and iPhone: registration, login, restart/session restoration, NGN/USD balances, transaction creation/edit/deletion, invalid amounts/dates, goal updates, savings records/history, photo replacement, network failure/refresh, sign out and JWT expiry. Check keyboard visibility, large text, screen readers and small screens. Native permissions, signing and device behavior remain separate checks; JavaScript exports do not verify them.

Expo references: [project setup](https://docs.expo.dev/get-started/create-a-project/), [EAS builds](https://docs.expo.dev/build/introduction/).
