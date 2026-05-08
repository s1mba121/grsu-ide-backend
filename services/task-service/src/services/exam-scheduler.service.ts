import { prisma } from '../db.js'
import { ExamService } from './exam.service.js'

let isClosingDueExams = false

export async function closeDueExams() {
    if (isClosingDueExams) return
    isClosingDueExams = true
    try {
        const now = new Date()
        const dueExams = await prisma.exam.findMany({
            where: {
                status: 'active',
                endsAt: { lte: now },
            },
            select: { id: true },
        })

        for (const exam of dueExams) {
            try {
                await ExamService.closeExam(exam.id, now)
            } catch (err) {
                console.error('[scheduler] failed to auto-close exam', exam.id, err)
            }
        }
    } finally {
        isClosingDueExams = false
    }
}
