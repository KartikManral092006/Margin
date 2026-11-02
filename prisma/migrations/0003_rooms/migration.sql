-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('member', 'answerer', 'host');

-- CreateTable
CREATE TABLE "lectures" (
    "id" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "durationSec" INTEGER,
    "metaFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nexconnChannelId" TEXT NOT NULL,
    "nexconnGroupReadyAt" TIMESTAMP(3),
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lectures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lecture_memberships" (
    "lectureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nexconnJoinedAt" TIMESTAMP(3),

    CONSTRAINT "lecture_memberships_pkey" PRIMARY KEY ("lectureId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "lectures_nexconnChannelId_key" ON "lectures"("nexconnChannelId");

-- CreateIndex
CREATE INDEX "lectures_visibility_memberCount_createdAt_idx" ON "lectures"("visibility", "memberCount" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "lectures_visibility_createdAt_idx" ON "lectures"("visibility", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lectures_public_youtubeId_key" ON "lectures"("youtubeId") WHERE ("visibility" = 'public');

-- CreateIndex
CREATE INDEX "lecture_memberships_userId_joinedAt_idx" ON "lecture_memberships"("userId", "joinedAt" DESC);

-- AddForeignKey
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecture_memberships" ADD CONSTRAINT "lecture_memberships_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecture_memberships" ADD CONSTRAINT "lecture_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
