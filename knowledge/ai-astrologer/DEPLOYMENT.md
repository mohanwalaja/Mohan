# Deploying the Local Source-Based Astrologer on cPanel

## Overview

The ASTRO SIVAM astrologer chat runs **100% locally in PHP 8.1+ with MySQL** — no OpenAI/Claude/Gemini API keys and zero outbound network calls.

## Required Files (Included Automatically in `dist.zip` and `deploy_cpanel.sh`)

- `knowledge/.htaccess` and `api/knowledge/.htaccess` — block direct HTTP downloads of server-side rule tables.
- `knowledge/ai-astrologer/sources.json` (mirrored at `api/knowledge/ai-astrologer/sources.json`).
- `knowledge/ai-astrologer/rules/*.json` (`life-areas.json`, `remedies.json`, `guided-questions.json`, `guardrails.json`, `report-sections.json`, `astrology-encyclopedia.json`).
- `api/ai_astrologer.php`, `api/astrology/ai_astrologer_provider.php`, `api/astrology/ai_astrologer_offline.php`, `api/astrology/ai_report_extract.php`.

## Database Tables

Fresh installations importing `api/schema.sql` already create `ai_chat_sessions` (including `person_id`), `ai_chat_messages`, and `ai_chat_handoffs` with no runtime `CREATE` or `ALTER` privileges needed. Existing databases created before those tables can run `api/migrations/007_ai_astrologer_chat.sql` and `api/migrations/014_ai_chat_person_id.sql`.

## Verification

Open **Admin Portal -> AI Astrologer** and click **Check the setup**. Every subsystem check should display **OK** with **39 verified sources · 0 external APIs**.
