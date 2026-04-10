-- DropForeignKey
ALTER TABLE "exams" DROP CONSTRAINT "exams_task_id_fkey";

-- AlterTable
ALTER TABLE "exam_sessions" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "folderId" TEXT,
ALTER COLUMN "task_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
