package com.secasaudavel.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.net.URISyntaxException;

public class MainActivity extends Activity {

    public static final String USER_AGENT_MARKER = "SecaSaudavelApp/Android";

    private FrameLayout root;
    private WebView webView;
    private ProgressBar progressBar;
    private View offlineView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private LinkPolicy linkPolicy;
    private FileSaver fileSaver;
    private Object backCallback;
    private boolean backCallbackRegistered;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        linkPolicy = new LinkPolicy(BuildConfig.SITE_URL);
        buildLayout();
        configureWebView();
        setupBackNavigation();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }
        if (webView.getUrl() == null) {
            webView.loadUrl(initialUrl(getIntent()));
        }
    }

    private void buildLayout() {
        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.brand));

        webView = new WebView(this);
        webView.setBackgroundColor(getColor(R.color.background));
        root.addView(webView, matchParent());

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setIndeterminate(false);
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(4), Gravity.TOP);
        root.addView(progressBar, barParams);

        offlineView = buildOfflineView();
        offlineView.setVisibility(View.GONE);
        root.addView(offlineView, matchParent());

        setContentView(root);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                if (fullscreenView != null) {
                    view.setPadding(0, 0, 0, 0);
                } else {
                    view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                }
                return WindowInsets.CONSUMED;
            });
        }
    }

    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(getColor(R.color.background));
        box.setPadding(dp(32), dp(32), dp(32), dp(32));

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextSize(22);
        title.setTextColor(getColor(R.color.brand));
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView message = new TextView(this);
        message.setText(R.string.offline_message);
        message.setTextSize(16);
        message.setTextColor(Color.DKGRAY);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(12), 0, dp(24));
        box.addView(message);

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> {
            offlineView.setVisibility(View.GONE);
            String url = webView.getUrl();
            if (url == null || url.startsWith("about:")) {
                webView.loadUrl(BuildConfig.SITE_URL);
            } else {
                webView.reload();
            }
        });
        box.addView(retry);
        return box;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " " + userAgentSuffix());

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) {
                    return false;
                }
                String url = request.getUrl().toString();
                if (linkPolicy.targetFor(url) == LinkPolicy.Target.IN_APP) {
                    return false;
                }
                openExternally(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (url != null && url.startsWith(BuildConfig.SITE_URL)) {
                    view.evaluateJavascript(FileSaver.PAGE_SHIM, null);
                }
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    offlineView.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                updateBackCallback();
            }
        });

        fileSaver = new FileSaver(this, webView, linkPolicy);
        webView.addJavascriptInterface(fileSaver, FileSaver.BRIDGE_NAME);
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (url.startsWith("https://")) {
                openExternally(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                view.setBackgroundColor(Color.BLACK);
                root.addView(view, matchParent());
                webView.setVisibility(View.GONE);
                root.requestApplyInsets();
                updateBackCallback();
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });
    }

    static String userAgentSuffix() {
        return USER_AGENT_MARKER + "/" + BuildConfig.VERSION_NAME + " (" + BuildConfig.DISTRIBUTION + ")";
    }

    private void exitFullscreen() {
        if (fullscreenView == null) {
            return;
        }
        root.removeView(fullscreenView);
        fullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
        root.requestApplyInsets();
        updateBackCallback();
    }

    private void openExternally(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent:")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            startActivity(intent);
        } catch (ActivityNotFoundException | URISyntaxException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    private String initialUrl(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String url = intent.getData().toString();
            if (linkPolicy.isSiteUrl(url)) {
                return url;
            }
        }
        return BuildConfig.SITE_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null && linkPolicy.isSiteUrl(intent.getData().toString())) {
            webView.loadUrl(intent.getData().toString());
        }
    }

    private boolean handleBack() {
        if (fullscreenView != null) {
            exitFullscreen();
            return true;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return false;
    }

    private void setupBackNavigation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = (OnBackInvokedCallback) this::handleBack;
        }
    }

    private void updateBackCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || backCallback == null) {
            return;
        }
        boolean shouldIntercept = fullscreenView != null || webView.canGoBack();
        OnBackInvokedDispatcher dispatcher = getOnBackInvokedDispatcher();
        if (shouldIntercept && !backCallbackRegistered) {
            dispatcher.registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, (OnBackInvokedCallback) backCallback);
            backCallbackRegistered = true;
        } else if (!shouldIntercept && backCallbackRegistered) {
            dispatcher.unregisterOnBackInvokedCallback((OnBackInvokedCallback) backCallback);
            backCallbackRegistered = false;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!handleBack()) {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FileSaver.REQUEST_CODE) {
            fileSaver.onActivityResult(resultCode, data);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            root.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }

    private FrameLayout.LayoutParams matchParent() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
