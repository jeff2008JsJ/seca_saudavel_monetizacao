package com.secasaudavel.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.security.SecureRandom;

/**
 * Saves files the site generates in the page (blob: downloads such as "Exportar meus dados"),
 * which WebView cannot download by itself. The page hands the file over through a JS bridge
 * and the user picks where to save it with the system file picker.
 */
final class FileSaver {
    static final String BRIDGE_NAME = "SecaSaudavelAndroid";
    static final int REQUEST_CODE = 4101;

    /**
     * Captures blobs passed to URL.createObjectURL and reroutes <a download> clicks on them.
     * The token is only handed to the top frame, so embedded iframes (YouTube) can't use the bridge.
     */
    String pageShim() {
        return "(function(){if(window.__secaFileSaver||!window." + BRIDGE_NAME + ")return;"
            + "window.__secaFileSaver=1;var blobs={};"
            + "var create=URL.createObjectURL;URL.createObjectURL=function(o){var u=create.apply(URL,arguments);"
            + "if(o instanceof Blob)blobs[u]=o;return u};"
            + "var revoke=URL.revokeObjectURL;URL.revokeObjectURL=function(u){setTimeout(function(){delete blobs[u]},60000);"
            + "return revoke.apply(URL,arguments)};"
            + "var click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){"
            + "var b=this.download&&blobs[this.href];if(!b)return click.apply(this,arguments);"
            + "var name=this.download,r=new FileReader();"
            + "r.onload=function(){" + BRIDGE_NAME + ".saveFile('" + token + "',name,b.type||'application/octet-stream',r.result)};"
            + "r.readAsDataURL(b)}})();";
    }

    private final Activity activity;
    private final WebView webView;
    private final LinkPolicy linkPolicy;
    private final String token;

    FileSaver(Activity activity, WebView webView, LinkPolicy linkPolicy) {
        this.activity = activity;
        this.webView = webView;
        this.linkPolicy = linkPolicy;
        byte[] random = new byte[16];
        new SecureRandom().nextBytes(random);
        StringBuilder hex = new StringBuilder();
        for (byte b : random) {
            hex.append(String.format("%02x", b));
        }
        this.token = hex.toString();
    }

    /** Kept on disk so the export survives the activity being recreated while the picker is open. */
    private File pendingFile() {
        return new File(activity.getCacheDir(), "pending-export");
    }

    @JavascriptInterface
    public void saveFile(String callerToken, String fileName, String mimeType, String dataUrl) {
        if (!token.equals(callerToken)) {
            return;
        }
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
            try (OutputStream out = new FileOutputStream(pendingFile())) {
                out.write(bytes);
            } catch (IOException e) {
                Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_LONG).show();
                return;
            }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mimeType)
                    .putExtra(Intent.EXTRA_TITLE, fileName);
            try {
                activity.startActivityForResult(intent, REQUEST_CODE);
            } catch (ActivityNotFoundException e) {
                pendingFile().delete();
                Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_LONG).show();
            }
        });
    }

    void onActivityResult(int resultCode, Intent data) {
        File pending = pendingFile();
        Uri uri = data == null ? null : data.getData();
        if (resultCode != Activity.RESULT_OK || uri == null) {
            pending.delete();
            return;
        }
        byte[] bytes;
        try {
            bytes = readAll(pending);
        } catch (IOException e) {
            deleteQuietly(uri);
            Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_LONG).show();
            return;
        } finally {
            pending.delete();
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

    private static byte[] readAll(File file) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    private void deleteQuietly(Uri uri) {
        try {
            DocumentsContract.deleteDocument(activity.getContentResolver(), uri);
        } catch (Exception ignored) {
            // The picker may hand back a URI that isn't a deletable document.
        }
    }
}
