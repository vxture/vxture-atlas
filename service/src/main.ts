import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ModelPlatformModule } from "./model-platform.module";
import { prisma } from "./prisma";

async function bootstrap(): Promise<void> {
  loadRootEnv();
  await prisma.$connect();

  const app = await NestFactory.create(ModelPlatformModule);
  app.enableCors();

  const port = Number(process.env.MODEL_PLATFORM_PORT ?? 3100);
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
