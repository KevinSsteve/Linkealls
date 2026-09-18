# Linkealls onboarding validation

Focused browser validation of the changed onboarding journey was run against the
DEV preview only, using a temporary phone/PIN account and native browser
controls. No production URLs, providers, AI, payments, or API registration
bypasses were used.

## Verified

- Registration progressed through name, phone, PIN, and PIN confirmation.
- Empty phone submission showed `Confirma o teu número de telemóvel para
  continuar.`.
- The real registration request completed and showed the busy state
  `A criar a tua conta`; the back control was disabled while it was pending.
- Recovery-code confirmation and continuation into onboarding worked. The
  recovery value is intentionally not recorded here.
- At 320px, registration/configuration/handle screens were vertically laid out
  without observed horizontal page overflow. The wordmark remained compact;
  no oversized logo/icon was observed.
- `Sem site` empty submission showed
  `Descreve o teu negócio com pelo menos 20 caracteres.`.
- Invalid website input showed `O endereço do site não parece ser válido.`.
- `https://example.org/MixedCasePath` was retained exactly in the website
  input, including path casing.
- Skipping analysis reached ChooseHandle at `2 DE 2`; a unique handle was
  reported as `Este link está disponível.`.

## Restoration correction

The initial report incorrectly attributed a bug to the app. That check clicked
`Voltar` after the deliberate `Saltar e configurar depois` path, which clears
the pending AI draft by design. Re-tested correctly: selecting `Sem site`,
entering a valid description, clicking the actual `Continuar`/`Estruturar com
IA` (`saveBusinessOnboarding`) action, and then clicking `Voltar` restored both
the Sem site branch and the exact description. No restoration bug was confirmed.

## Not completed

Provider/AI analysis was intentionally skipped after the corrected save/back
check. The remaining critical handle checks completed: a one-shot real-browser
PUT 409 with Portuguese conflict text was shown while retaining the candidate;
a new unique handle saved through the real PUT, navigated to the owner profile,
and rendered without React runtime errors; repeating the same-handle PUT via
same-origin browser fetch returned HTTP 200; and reload preserved the owner
route/handle. Stale availability ordering, GET-error retry UI, 401 saving
preservation, and 1280px login typography were not run.

Cleanup initially used APIRequestContext and returned 403 because it lacked the
browser Origin/CSRF context. It was retried with same-origin page fetch using
the existing browser cookies: reauthentication returned HTTP 200 and account
deletion returned HTTP 200. The temporary DEV account was successfully
removed. No response bodies, credentials, recovery code, phone, or user ID are
stored in this document.