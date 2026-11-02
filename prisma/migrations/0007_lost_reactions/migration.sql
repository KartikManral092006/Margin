-- CreateTable
CREATE TABLE "lost_reactions" (
    "lectureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucket" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lost_reactions_pkey" PRIMARY KEY ("lectureId","userId","bucket")
);

-- CreateIndex
CREATE INDEX "lost_reactions_lectureId_bucket_idx" ON "lost_reactions"("lectureId", "bucket");

-- CreateIndex
CREATE INDEX "lost_reactions_userId_idx" ON "lost_reactions"("userId");

-- AddForeignKey
ALTER TABLE "lost_reactions" ADD CONSTRAINT "lost_reactions_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_reactions" ADD CONSTRAINT "lost_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

