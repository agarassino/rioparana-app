# Feedback delivery coordination

Approved scope: issue #1, in-app feedback and private owner administration.

This tracker uses feature-branch-chain delivery. Every child targets its immediate predecessor. Only this integration tracker may eventually target main.

Status: draft; do not merge. No deployment or release authorization is implied.

All child trees require independent review, focused verification and a maximum 400 changed lines, except the explicitly approved S0 Fastify dependency migration (516 lines). Final integration requires app verification, server tests including real disposable PostgreSQL, server build, production audit and source snapshot equality.

Open release gates: container-native Argon2, deployed database roles and private networking, verified email sender, physical-device feedback and notification flows, compliance publication, and explicit owner release approval.
