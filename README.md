# CampusNotes

A MERN note sharing app for students. This repository implements the complete non-AI foundation: accounts, original PDF and image uploads, discovery, voting, reputation, requests, reporting, and moderation. AI integration points are documented but disabled.

## Quick start

Run `npm install`, copy the environment examples, fill in MongoDB Atlas and Cloudinary credentials, then run `npm run dev`. See [setup](docs/SETUP.md) for details. Useful commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run seed`.

The API contract is in [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md), architecture in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the four independent AI integration locations in [docs/AI_INTEGRATION_GUIDE.md](docs/AI_INTEGRATION_GUIDE.md).

Credentials are required to exercise cloud upload and Atlas persistence. No secrets are checked in. The app is configured for Vercel (client) and Render (server), but deployment requires your accounts and has not been performed here.
