# Architecture

CampusNotes uses npm workspaces. The React/Vite client talks to the Express API with credentialed requests. Express validates inputs with Zod, enforces cookie sessions and roles, and persists records in MongoDB via Mongoose. Cloudinary stores original authenticated assets; database records store only provider identifiers. The API creates signed delivery URLs when a browser requests a file.

`server/src/controllers` owns HTTP behavior; `models` owns persistence; `services/storage` isolates Cloudinary; `services/reputation` derives points from authoritative notes, upvotes, and fulfilled requests. Vote rows and note counters update in a MongoDB transaction. MongoDB Atlas must support transactions. There is no AI provider or simulated AI output.

Published notes are visible to everyone, including the original document. The asset is delivered through a signed Cloudinary URL obtained from the public note route. This is access control against direct unsigned asset access, not privacy for published notes.
