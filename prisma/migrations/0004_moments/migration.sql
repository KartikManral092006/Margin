-- CreateEnum
CREATE TYPE "MomentStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "moments" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT NOT NULL,
    "tSec" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "status" "MomentStatus" NOT NULL DEFAULT 'open',
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "pinnedAt" TIMESTAMP(3),
    "pinnedById" TEXT,
    "nexconnMessageId" TEXT,
    "sendStatus" "SendStatus" NOT NULL DEFAULT 'pending',
    "sendAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moments_lectureId_tSec_idx" ON "moments"("lectureId", "tSec");

-- CreateIndex
CREATE INDEX "moments_parentId_idx" ON "moments"("parentId");

-- CreateIndex
CREATE INDEX "moments_lectureId_sendStatus_idx" ON "moments"("lectureId", "sendStatus");

-- CreateIndex
CREATE UNIQUE INDEX "moments_userId_clientId_key" ON "moments"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
