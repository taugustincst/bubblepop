package com.taugustincst.bubblepop;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Bubble Pop: a single full-screen WebView that plays the game entirely from
 * packaged assets. WebViewAssetLoader serves assets/www over a synthetic
 * https origin (appassets.androidplatform.net), so localStorage behaves like
 * a normal secure origin and persists between launches. The app declares no
 * INTERNET permission and the game makes zero network calls.
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/www/index.html";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The path handler is registered at "/", NOT at "/www/":
        // WebViewAssetLoader hands the handler the path *after* the
        // registered prefix (its "suffix path"), and AssetsPathHandler opens
        // that suffix as the asset path. Registering "/www/" made it open
        // "index.html" — assets/index.html, which does not exist — and the
        // handler's error path returns an empty response, which the WebView
        // reports as ERR_INVALID_RESPONSE: the game never loaded, and Play
        // rejected vc1 for it on 3 Nov 2026. At "/", the suffix of
        // /www/index.html is "www/index.html", the asset that exists.
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        // Forward the page's console to logcat: the emulator launch test
        // greps for the game's BUBBLEPOP_READY line as proof the page loaded
        // and its script ran, and the same lines help diagnose field issues.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.i("BubblePopWeb", msg.message()
                        + " (" + msg.sourceId() + ":" + msg.lineNumber() + ")");
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        // The game has a background melody and WebAudio sound effects.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        setContentView(webView);
        enterImmersiveMode();
        webView.loadUrl(START_URL);
    }

    private void enterImmersiveMode() {
        WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) {
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    /**
     * Back button: the game pushes a history state when a round starts and its
     * own popstate handler ends the round. So when the WebView has history,
     * Back goes back (ending the round, exactly as designed); with no history
     * left, Back exits the app.
     */
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
