# SPEC-FE-I18N-001: Frontend Internationalization (i18n) Architecture Specification

## 1. Executive Summary
This document specifies the Internationalization (i18n) architecture for `omni-web-next` (Next.js 16 App Router) and cross-platform clients, ensuring seamless localization for enterprise deployments across multiple languages (Vietnamese, English, Chinese).

## 2. Core Requirements
- **Supported Locales**: `vi` (default), `en`, `zh`.
- **Zero Runtime Overhead**: Translation dictionaries loaded asynchronously per route/namespace or cached efficiently.
- **Server & Client Component Parity**: Seamless translation retrieval across React Server Components (RSC) and Client Components.
- **Type Safety**: Strictly typed translation keys with TypeScript autocomplete to avoid runtime missing-key bugs.
- **Graceful Fallback**: If a key is missing in target locale, fall back to Vietnamese (`vi`).

## 3. Directory Layout
```
omni-web-next/
├── messages/
│   ├── vi/
│   │   ├── common.json
│   │   ├── chat.json
│   │   ├── settings.json
│   │   └── channels.json
│   ├── en/
│   └── zh/
├── src/
│   ├── i18n/
│   │   ├── config.ts       # Supported locales, default locale
│   │   ├── request.ts      # Server request-scoped locale resolver
│   │   └── client.ts       # Client-side translation hooks
│   └── components/
│       └── common/
│           └── language-switcher.tsx
```

## 4. Key Naming Conventions
- Hierarchical snake_case keys grouped by domain:
  - `chat.takeover.resume_bot`: "Bật lại Bot" / "Resume Bot"
  - `chat.composer.placeholder`: "Nhập tin nhắn..." / "Type a message..."
  - `common.actions.send`: "Gửi" / "Send"
  - `common.actions.cancel`: "Hủy" / "Cancel"

## 5. Storage and Detection Strategy
1. **Cookie (`NEXT_LOCALE`)**: Primary source for SSR rendering to prevent layout shifts.
2. **LocalStorage (`omni_locale`)**: Client persistence across browser restarts.
3. **Accept-Language Header**: Initial fallback detection on first visit.
