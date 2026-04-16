import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { HttpError } from "./middleware/httpError.js";
import { registerRoutes } from "./routes/registerRoutes.js";

initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors({ origin: true }));
app.use(express.json());

registerRoutes(app);

const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next(new HttpError(404, "Not found"));
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server http://localhost:${port}`);
});
