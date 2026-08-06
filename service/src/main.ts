import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { AtlasModule } from "./atlas.module";
import { prisma } from "./prisma";

async function bootstrap(): Promise<void> {
  loadRootEnv();
  await prisma.$connect();

  // rawBody: true - the provisioning webhook (POST /provisioning/webhook) must
  // verify its HMAC signature over the exact raw request bytes, not a
  // re-serialized JSON.stringify(parsedBody) (docs/30-design/identity/080-rp-integration.md
  // section 4 step 1). Nest/Express exposes this as req.rawBody when enabled.
  const app = await NestFactory.create(AtlasModule, { rawBody: true });
  app.enableCors();

  // PORT, not MODEL_PLATFORM_PORT: docker-compose.yml has always set `PORT`,
  // while this line read a name nothing set (a leftover from before TD-013
  // retired the `model-platform` prefix). Both halves were dead and only agreed
  // because both hardcoded 3100 - changing compose's PORT would have left the
  // app listening on 3100 while the publish mapping pointed elsewhere, with the
  // healthcheck still green because it probes 127.0.0.1:3100 inside the
  // container.
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
}

void bootstrap();

function loadRootEnv(): void {
  const rootDir = resolve(process.cwd(), "..", "..", "..");
  const candidates = [
    join(rootDir, ".env.local"),
    join(rootDir, ".env"),
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
