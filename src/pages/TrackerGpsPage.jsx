import { useEffect } from "react";

export default function TrackerGpsPage() {
  useEffect(() => {
    console.log("[TRACKER_BUILD] 2026-04-04-B");
  }, []);

  return (
    <div style={{fontSize: "40px", color: "red"}}>
      TRACKER OK 2026 FINAL
    </div>
  );
}

        for (String candidate : candidateIds) {
            int resId = getResources().getIdentifier(candidate, "id", getPackageName());
            if (resId != 0) {
                try {
                    WebView found = findViewById(resId);
                    if (found != null) {
                        Log.d(TAG, "[WV] WebView resolved with id @" + candidate);
                        return found;
                    }
                } catch (Exception e) {
                    Log.w(TAG, "[WV] Failed resolving id @" + candidate, e);
                }
            }
        }

        Log.e(TAG, "[WV] No valid WebView id found. Expected one of: webview, webView, wv, trackerWebView");
        return null;
    }

    private void checkAndRequestLocationPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Log.d(TAG, "[PERM] Android < M, no runtime permissions needed");
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "[PERM] Requesting ACCESS_FINE_LOCATION");
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                    REQ_FINE_LOCATION
            );
            return;
        }

        Log.d(TAG, "[PERM] ACCESS_FINE_LOCATION already granted");
        checkAndRequestBackgroundLocationIfNeeded();
    }

    private void checkAndRequestBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "[PERM] Requesting ACCESS_BACKGROUND_LOCATION");
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                    REQ_BACKGROUND_LOCATION
            );
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Log.d(TAG, "[PERM] ACCESS_BACKGROUND_LOCATION already granted");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQ_FINE_LOCATION) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            Log.d(TAG, "[PERM] ACCESS_FINE_LOCATION result: " + (granted ? "GRANTED" : "DENIED"));
            if (granted) {
                checkAndRequestBackgroundLocationIfNeeded();
            }
            return;
        }

        if (requestCode == REQ_BACKGROUND_LOCATION) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            Log.d(TAG, "[PERM] ACCESS_BACKGROUND_LOCATION result: " + (granted ? "GRANTED" : "DENIED"));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    public static class AndroidBridge {

        private final Context context;

        public AndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void startTracking() {
            startTracking(null);
        }

        @JavascriptInterface
        public void startTracking(String trackerUrl) {
            Log.d(TAG, "[ANDROID] startTracking called with url: " + trackerUrl);

            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                    != PackageManager.PERMISSION_GRANTED) {
                Log.w(TAG, "[ANDROID] startTracking blocked: ACCESS_FINE_LOCATION not granted, requesting");
                ActivityCompat.requestPermissions(
                        (Activity) context,
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                        REQ_FINE_LOCATION
                );
                return;
            }

            try {
                Intent intent = TrackingService.createStartIntent(context, trackerUrl);
                ContextCompat.startForegroundService(context, intent);
                Log.d(TAG, "[ANDROID] TrackingService START requested");
            } catch (Exception e) {
                Log.e(TAG, "[ANDROID] Error starting TrackingService", e);
            }
        }

        @JavascriptInterface
        public void stopTracking() {
            Log.d(TAG, "[ANDROID] stopTracking called");
            try {
                Intent intent = TrackingService.createStopIntent(context);
                context.startService(intent);
                Log.d(TAG, "[ANDROID] TrackingService STOP requested");
            } catch (Exception e) {
                Log.e(TAG, "[ANDROID] Error stopping TrackingService", e);
            }
        }

        @JavascriptInterface
        public boolean hasLocationPermissions() {
            boolean hasFine = ActivityCompat.checkSelfPermission(
                    context, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;

            boolean hasBackground = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                    || ActivityCompat.checkSelfPermission(
                    context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;

            boolean result = hasFine && hasBackground;
            Log.d(TAG, "[ANDROID] hasLocationPermissions=" + result
                    + " fine=" + hasFine + " background=" + hasBackground);
            return result;
        }
    }

    private static class TrackerWebViewClient extends WebViewClient {

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            Log.d(TAG, "[WEBVIEW] onPageStarted url=" + url);
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.d("TRACKER_LOAD", "onPageFinished url=" + url);
            Log.d("TRACKER_LOAD", "title=" + view.getTitle());

            view.evaluateJavascript(
                    "(function(){return document.body ? document.body.innerText.slice(0,400) : 'NO_BODY';})()",
                    value -> Log.d("TRACKER_HTML", "BODY=" + value)
            );

            view.evaluateJavascript(
                    "(function(){return typeof window.Android + '|' + Object.keys(window.Android || {}).join(',');})()",
                    value -> Log.d("WV_BRIDGE", "bridge=" + value)
            );

            super.onPageFinished(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            String url = request != null && request.getUrl() != null ? request.getUrl().toString() : "(null)";
            String desc = error != null && error.getDescription() != null
                    ? error.getDescription().toString()
                    : "(no description)";
            int code = error != null ? error.getErrorCode() : -1;

            Log.e(TAG, "[WEBVIEW_ERROR] code=" + code + " desc=" + desc + " url=" + url);
            super.onReceivedError(view, request, error);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            String url = request != null && request.getUrl() != null ? request.getUrl().toString() : "(null)";
            int status = errorResponse != null ? errorResponse.getStatusCode() : -1;

            Log.e(TAG, "[WEBVIEW_HTTP_ERROR] status=" + status + " url=" + url);
            super.onReceivedHttpError(view, request, errorResponse);
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            String url = error != null && error.getUrl() != null ? error.getUrl() : "(null)";
            Log.e(TAG, "[WEBVIEW_SSL_ERROR] url=" + url + " error=" + error);
            handler.cancel();
        }
    }
}