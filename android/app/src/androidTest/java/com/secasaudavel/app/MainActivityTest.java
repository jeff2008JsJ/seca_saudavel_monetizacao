package com.secasaudavel.app;

import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasExtra;
import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static androidx.test.espresso.web.model.Atoms.getCurrentUrl;
import static androidx.test.espresso.web.model.Atoms.getTitle;
import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.webClick;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.hamcrest.Matchers.allOf;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.espresso.intent.Intents;
import androidx.test.espresso.web.webdriver.Locator;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;

/** Runs against the live site, so the device needs internet access. */
@RunWith(AndroidJUnit4.class)
public class MainActivityTest {

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule = new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void opensTheSiteWithItsTitle() {
        onWebView()
                .withTimeout(90, TimeUnit.SECONDS)
                .withElement(findElement(Locator.TAG_NAME, "body"))
                .check(webMatches(getCurrentUrl(), startsWith(BuildConfig.SITE_URL)))
                .check(webMatches(getTitle(), containsString("Seca Saudável")));
    }

    @Test
    public void accountTabShowsTheLoginForm() {
        onWebView()
                .withTimeout(90, TimeUnit.SECONDS)
                // On phones the account tab sits behind the "more" button.
                .withElement(findElement(Locator.ID, "tabMore"))
                .perform(webClick())
                .withElement(findElement(Locator.CSS_SELECTOR, "button[data-tab='conta']"))
                .perform(webClick())
                .withElement(findElement(Locator.CSS_SELECTOR, "section#conta.active"))
                .withElement(findElement(Locator.ID, "loginEmail"));
    }

    @Test
    public void identifiesItselfToTheSite() {
        activityRule.getScenario().onActivity(activity -> {
            WebView webView = findWebView(activity.getWindow().getDecorView());
            assertNotNull(webView);
            assertTrue(webView.getSettings().getUserAgentString().endsWith(MainActivity.userAgentSuffix()));
        });
    }

    @Test
    public void exportDataSavesAFile() throws Exception {
        onWebView()
                .withTimeout(90, TimeUnit.SECONDS)
                .withElement(findElement(Locator.ID, "tabMore"));

        File target = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),
                "export-test.json");
        target.delete();
        Intents.init();
        try {
            intending(allOf(hasAction(Intent.ACTION_CREATE_DOCUMENT),
                    hasExtra(Intent.EXTRA_TITLE, "seca-saudavel-dados.json")))
                    .respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,
                            new Intent().setData(Uri.fromFile(target))));

            long deadline = SystemClock.uptimeMillis() + 30_000;
            while (target.length() == 0 && SystemClock.uptimeMillis() < deadline) {
                activityRule.getScenario().onActivity(activity ->
                        findWebView(activity.getWindow().getDecorView()).evaluateJavascript("exportData()", null));
                SystemClock.sleep(2_000);
            }
        } finally {
            Intents.release();
        }

        String saved = new String(Files.readAllBytes(target.toPath()), StandardCharsets.UTF_8);
        assertTrue(saved, saved.trim().startsWith("{"));
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) {
            return (WebView) view;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}
