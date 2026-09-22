# Android Production v15 — 2026-09-22

Package: com.fenice.geofieldgps. versionCode 15, versionName 1.1, targetSdk 36.
Built in C:/dev/geocercas-app-starter/geocercas-twa using bundleRelease, including lintVitalRelease. Build succeeded and jarsigner verified the signed AAB. Release upload signing uses the existing keystore; no signing credentials copied into this repository.

Artifact: C:/dev/geocercas-app-starter/geocercas-twa/app/build/outputs/bundle/release/app-release.aab
SHA256: AFD08B66E28C38CED9EDCFDB1EF81AB90B81ED6E44D37837A4192C00E74BB061

Includes native RuntimeSessionRenewal and service/WebView integration previously tested in Preview. Replaced the legacy TrackingService Vercel deployment API address with app.tugeocercas.com/api. Corrected a placeholder public key; generated BuildConfig was checked against Production public anon key (wpaixkvokdkudymgjoua). Persisted public configuration for future builds.

Google Play verified latest existing bundle and Production release is v14. Created internal testing release draft 5 with title and release notes. Upload attempted twice; browser file chooser returned Not allowed, including after user reported permission enabled. AAB not uploaded, not released to testers or Production. Device inventory currently empty; installation, GPS, screen-off and reboot tests not run. Do not report a distributed update until Play confirms upload/release and the device receives it through Google Play.
