# PreConnix

PreConnix helps women in Nigeria look after their reproductive health, whether or not a pregnancy is part of their
plans. A woman takes a clinician-designed assessment, sees her Reproductive Health Score and focus areas, builds a
Reproductive Life Plan she can share with her doctor, and follows short lessons and a moderated community.

PreConnix Health Technologies is a Nigerian company, co-founded by Dr Gloria Williams-Aborishade (CEO) and Charles Aborishade (CTO).

## For reviewers
| What to look at | Where |
|---|---|
| Mobile app (Expo / React Native, iOS and Android) | `apps/mobile/` |
| API (TypeScript, Fastify, PostgreSQL) | `services/api/` |
| Assessment routing, validation and scoring | `packages/assessment-engine/` |
| Versioned questions and scoring policies | `packages/assessment-definitions/`, `packages/assessment-policies/` |
| Lessons, plan guidance, report and plan PDF templates | `packages/content/` |
| API description and scoring test cases | `contracts/` |

## AI use
A member can ask for an optional, separately consented, labelled AI-Explainer of her saved result. The AI never scores
and never replaces clinician-approved text. It receives no name, email or identifier. Answers tied to safety flags are
never sent to it. Every response passes an automated checker before she sees it.

## Safety by design
- Separate, recorded consents; 18+ agreement before an account is created.
- Server-authoritative scoring; the app contains routing only.
- Per-member encryption of free text; per-user database row-level security.
- No health data, email or token in logs, analytics, URLs or push payloads, enforced by tests.
- Download-my-data and in-app account deletion.
- Clinical content changes need clinician approval and are versioned in the code.

The 3,329 scoring test cases in `contracts/` were produced from the original assessment page and confirm the engine scores exactly as it did.

## Run and test
Requires Node.js. All local data is synthetic.

```bash
npm install
npm run api              # local API with synthetic data
npm run mobile           # Expo dev server for the app
npm test                 # engine tests, including 3,329 golden-master scoring cases
npm run test:mobile
npm run test:api
npm run typecheck
```

## Licence
Copyright (c) 2026 PreConnix Health Technologies. All rights reserved.

This repository is shared publicly so that it can be evaluated. No licence is granted to use, copy, modify or
distribute the code or content. PreConnix intends to release it under open-source licences if the work is funded.
