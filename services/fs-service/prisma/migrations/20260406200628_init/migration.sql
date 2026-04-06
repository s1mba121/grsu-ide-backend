-- CreateEnum
CREATE TYPE "Language" AS ENUM ('python', 'javascript');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'python',
    "is_readonly" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
