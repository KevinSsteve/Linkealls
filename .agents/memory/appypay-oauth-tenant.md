---
name: AppyPay OAuth tenant
description: Correct Azure AD tenant for AppyPay client_credentials token requests
---
AppyPay OAuth (client_credentials) must hit tenant `auth.appypay.co.ao`, i.e.
`https://login.microsoftonline.com/auth.appypay.co.ao/oauth2/token`.

**Why:** The tenant `appypay.onmicrosoft.com` rejects the (correct) resource GUID
`bee57785-7a19-4f1c-9c8d-aa03f2f0e333` with AADSTS500011 `invalid_resource` — the error
looks like a bad APPYPAY_RESOURCE secret, but the secret is fine; the tenant in the auth
URL is what matters. Confirmed via a live token request (200) after switching tenants.

**How to apply:** When AppyPay auth fails with AADSTS500011/invalid_resource, check the
auth URL tenant before touching the APPYPAY_RESOURCE secret. Community SDKs (e.g.
Gomes19/appypay-sdk) also default to the `auth.appypay.co.ao` tenant with this GUID.
