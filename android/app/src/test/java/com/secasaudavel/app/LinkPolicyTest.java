package com.secasaudavel.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LinkPolicyTest {

    private final LinkPolicy policy = new LinkPolicy("https://seca-saudavel-monetizacao.onrender.com/");

    @Test
    public void siteLinksStayInApp() {
        assertEquals(LinkPolicy.Target.IN_APP, policy.targetFor("https://seca-saudavel-monetizacao.onrender.com/termos"));
        assertEquals(LinkPolicy.Target.IN_APP, policy.targetFor("https://seca-saudavel-monetizacao.onrender.com/?assinatura=retorno"));
    }

    @Test
    public void mercadoPagoCheckoutStaysInApp() {
        assertEquals(LinkPolicy.Target.IN_APP, policy.targetFor("https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=1"));
        assertEquals(LinkPolicy.Target.IN_APP, policy.targetFor("https://http2.mlstatic.com/frontend-assets/x.js"));
    }

    @Test
    public void otherSitesAndSchemesOpenExternally() {
        assertEquals(LinkPolicy.Target.EXTERNAL, policy.targetFor("https://www.youtube.com/results?search_query=agachamento"));
        assertEquals(LinkPolicy.Target.EXTERNAL, policy.targetFor("mailto:contato@example.com"));
        assertEquals(LinkPolicy.Target.EXTERNAL, policy.targetFor("intent://checkout#Intent;scheme=mercadopago;end"));
        assertEquals(LinkPolicy.Target.EXTERNAL, policy.targetFor("http://seca-saudavel-monetizacao.onrender.com/"));
        assertEquals(LinkPolicy.Target.EXTERNAL, policy.targetFor("https://fakemercadopago.com/"));
    }

    @Test
    public void onlyHttpsSiteUrlsAreAcceptedAsDeepLinks() {
        assertTrue(policy.isSiteUrl("https://seca-saudavel-monetizacao.onrender.com/?reset=abc"));
        assertFalse(policy.isSiteUrl("https://evil.example.com/"));
        assertFalse(policy.isSiteUrl("http://seca-saudavel-monetizacao.onrender.com/"));
    }
}
