import {
    mkdir, readdir, readFile, writeFile,
    rm, rename, stat, access
} from 'fs/promises'
import { join, dirname, relative, basename } from 'path'
import { config } from '../config.js'

export interface FileNode {
    name: string
    path: string       // относительный путь от корня проекта
    type: 'file' | 'dir'
    children?: FileNode[]
}

// Корневая папка проекта на диске
export function projectRoot(userId: string, projectId: string): string {
    return join(config.STORAGE_PATH, 'users', userId, 'projects', projectId)
}

// Полный путь к файлу внутри проекта
function fullPath(userId: string, projectId: string, relPath: string): string {
    const root = projectRoot(userId, projectId)
    const resolved = join(root, relPath)
    // Защита от path traversal: ../../../etc/passwd
    if (!resolved.startsWith(root)) {
        throw { statusCode: 400, message: 'Недопустимый путь' }
    }
    return resolved
}

export const StorageService = {
    // Создать папку проекта с шаблонным файлом
    async initProject(userId: string, projectId: string, language: string, templateCode?: string) {
        const root = projectRoot(userId, projectId)
        await mkdir(root, { recursive: true })

        const entryFile = language === 'python' ? 'main.py' : 'index.js'
        const defaultCode = templateCode ?? (language === 'python'
            ? '# Напишите ваше решение здесь\n\n'
            : '// Напишите ваше решение здесь\n\n'
        )

        await writeFile(join(root, entryFile), defaultCode, 'utf-8')
    },

    // Рекурсивное дерево файлов
    async getTree(userId: string, projectId: string): Promise<FileNode[]> {
        const root = projectRoot(userId, projectId)
        return buildTree(root, root)
    },

    // Содержимое файла
    async readFile(userId: string, projectId: string, relPath: string): Promise<string> {
        const fp = fullPath(userId, projectId, relPath)
        try {
            return await readFile(fp, 'utf-8')
        } catch {
            throw { statusCode: 404, message: 'Файл не найден' }
        }
    },

    // Сохранить файл (создаёт папки если нужно)
    async writeFile(userId: string, projectId: string, relPath: string, content: string) {
        const fp = fullPath(userId, projectId, relPath)
        await mkdir(dirname(fp), { recursive: true })
        await writeFile(fp, content, 'utf-8')
    },

    // Создать пустой файл или директорию
    async create(userId: string, projectId: string, relPath: string, type: 'file' | 'dir') {
        const fp = fullPath(userId, projectId, relPath)

        // Проверяем что уже не существует
        try {
            await access(fp)
            throw { statusCode: 409, message: 'Уже существует' }
        } catch (err: any) {
            if (err.statusCode) throw err
        }

        if (type === 'dir') {
            await mkdir(fp, { recursive: true })
        } else {
            await mkdir(dirname(fp), { recursive: true })
            await writeFile(fp, '', 'utf-8')
        }
    },

    // Удалить файл или папку
    async delete(userId: string, projectId: string, relPath: string) {
        const fp = fullPath(userId, projectId, relPath)
        try {
            await rm(fp, { recursive: true, force: true })
        } catch {
            throw { statusCode: 404, message: 'Не найдено' }
        }
    },

    // Переименовать / переместить
    async rename(userId: string, projectId: string, oldPath: string, newPath: string) {
        const fp = fullPath(userId, projectId, oldPath)
        const np = fullPath(userId, projectId, newPath)
        await mkdir(dirname(np), { recursive: true })
        try {
            await rename(fp, np)
        } catch {
            throw { statusCode: 404, message: 'Файл не найден' }
        }
    },

    // Удалить весь проект с диска
    async deleteProject(userId: string, projectId: string) {
        const root = projectRoot(userId, projectId)
        await rm(root, { recursive: true, force: true })
    },
}

// Рекурсивный обход директории
async function buildTree(root: string, current: string): Promise<FileNode[]> {
    const entries = await readdir(current, { withFileTypes: true })
    const nodes: FileNode[] = []

    // Сортировка: папки сначала, потом файлы
    const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
    })

    for (const entry of sorted) {
        const absPath = join(current, entry.name)
        const relPath = relative(root, absPath)

        if (entry.isDirectory()) {
            const children = await buildTree(root, absPath)
            nodes.push({ name: entry.name, path: relPath, type: 'dir', children })
        } else {
            nodes.push({ name: entry.name, path: relPath, type: 'file' })
        }
    }

    return nodes
}