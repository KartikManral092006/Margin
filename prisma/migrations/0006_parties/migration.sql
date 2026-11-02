-- CreateTable
CREATE TABLE "watch_parties" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "nexconnOpenChannelId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "watch_parties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watch_parties_nexconnOpenChannelId_key" ON "watch_parties"("nexconnOpenChannelId");

-- CreateIndex
CREATE INDEX "watch_parties_lectureId_startedAt_idx" ON "watch_parties"("lectureId", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "watch_parties_one_active_key" ON "watch_parties"("lectureId") WHERE ("endedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
