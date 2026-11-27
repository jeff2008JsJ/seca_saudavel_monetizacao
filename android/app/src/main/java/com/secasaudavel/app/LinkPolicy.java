package com.secasaudavel.app;

import java.net.URI;
import java.util.Locale;

/** Decides whether a navigation stays inside the app or goes to another app. */
public final class LinkPolicy {

    public enum Target { IN_APP, EXTERNAL }

    private static final String[] IN_APP_DOMAINS = {
            // Mercado Pago checkout must stay in the WebView so back_url returns to the logged-in session.
            "mercadopago.com",
            "mercadopago.com.br",
            "mercadolivre.com",
            "mercadolivre.com.br",
            "mercadolibre.com",
            "mlstatic.com",
    };

    private final String siteHost;

    public LinkPolicy(String siteUrl) {
        this.siteHost = URI.create(siteUrl).getHost().toLowerCase(Locale.ROOT);
    }

    public Target targetFor(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            return Target.EXTERNAL;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) {
            return Target.IN_APP;
        }
        if (!scheme.equals("https")) {
            return Target.EXTERNAL;
        }
        if (host.equals(siteHost)) {
            return Target.IN_APP;
        }
        for (String domain : IN_APP_DOMAINS) {
            if (host.equals(domain) || host.endsWith("." + domain)) {
                return Target.IN_APP;
            }
        }
        return Target.EXTERNAL;
    }

    public boolean isSiteUrl(String url) {
        try {
            URI uri = URI.create(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && uri.getHost() != null
                    && uri.getHost().equalsIgnoreCase(siteHost);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
