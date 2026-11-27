package com.secasaudavel.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Saves files the site generates in the page (blob: downloads such as "Exportar meus dados"),
 * which WebView cannot download by itself. The page hands the file over through a JS bridge
 * and the user picks where to save it with the system file picker.
 */
final class FileSaver {
    static final String BRIDGE_NAME = "SecaSaudavelAndroid";
    static final int REQUEST_CODE = 4101;

    /** Captures blobs passed to URL.createObjectURL and reroutes <a download> clicks on them. */
    static final String PAGE_SHIM = "(function(){if(window.__secaFileSaver||!window." + BRIDGE_NAME + ")return;"
            + "window.__secaFileSaver=1;var blobs={};"
            + "var create=URL.createObjectURL;URL.createObjectURL=function(o){var u=create.apply(URL,arguments);"
            + "if(o instanceof Blob)blobs[u]=o;return u};"
            + "var revoke=URL.revokeObjectURL;URL.revokeObjectURL=function(u){setTimeout(function(){delete blobs[u]},60000);"
            + "return revoke.apply(URL,arguments)};"
            + "var click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){"
            + "var b=this.download&&blobs[this.href];if(!b)return click.apply(this,arguments);"
            + "var name=this.download,r=new FileReader();"
            + "r.onload=function(){" + BRIDGE_NAME + ".saveFile(name,b.type||'application/octet-stream',r.result)};"
            + "r.readAsDataURL(b)}})();";

    private final Activity activity;
    private final WebView webView;
    private final LinkPolicy linkPolicy;
    private byte[] pendingBytes;

    FileSaver(Activity activity, WebView webView, LinkPolicy linkPolicy) {
        this.activity = activity;
        this.webView = webView;
        this.linkPolicy = linkPolicy;
    }

    @JavascriptInterface
    public void saveFile(String fileName, String mimeType, String dataUrl) {
        int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
        if (comma < 0) {
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return;
        }
        activity.runOnUiThread(() -> {
            String pageUrl = webView.getUrl();
            if (pageUrl == null || !pageUrl.startsWith(BuildConfig.SITE_URL)
                    || linkPolicy.targetFor(pageUrl) != LinkPolicy.Target.IN_APP) {
                return;
            }
            pendingBytes = bytes;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mimeType)
                    .putExtra(Intent.EXTRA_TITLE, fileName);
            try {
                activity.startActivityForResult(intent, REQUEST_CODE);
            } catch (ActivityNotFoundException e) {
                pendingBytes = null;
                Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_LONG).show();
            }
        });
    }

    void onActivityResult(int resultCode, Intent data) {
        byte[] bytes = pendingBytes;
        pendingBytes = null;
        Uri uri = data == null ? null : data.getData();
        if (resultCode != Activity.RESULT_OK || bytes == null || uri == null) {
            return;
        }
        try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
            if (out == null) {
                throw new IOException("No output stream for " + uri);
            }
            out.write(bytes);
            Toast.makeText(activity, R.string.file_saved, Toast.LENGTH_SHORT).show();
        } catch (IOException | SecurityException e) {
            Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_LONG).show();
        }
    }
}
