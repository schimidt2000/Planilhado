import { spawn } from 'child_process'
import path from 'path'
import type { ParseResult } from './types'

export async function parsePDF(fileBuffer: Buffer, password?: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    // Nixpacks exposes its Python virtualenv on PATH as `python`.
    const pythonPath = process.env.PYTHON_PATH || 'python'
    const scriptPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'parse_pdf.py')

    const args = [scriptPath]
    if (password) {
      args.push('--password', password)
    }

    const proc = spawn(pythonPath, args, {
      env: {
        ...process.env,
        PYTHONPATH: path.join(/*turbopackIgnore: true*/ process.cwd(), 'lib'),
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdin.write(fileBuffer)
    proc.stdin.end()

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (!stdout.trim()) {
        reject(new Error(stderr || 'Script Python não retornou nenhuma saída'))
        return
      }

      let result: ParseResult & { error?: string }
      try {
        result = JSON.parse(stdout)
      } catch {
        reject(new Error(`Saída inválida do parser: ${stdout.slice(0, 200)}`))
        return
      }

      if (result.error) {
        reject(new Error(result.error))
        return
      }

      if (code !== 0 && !result.transactions) {
        reject(new Error(stderr || `Processo saiu com código ${code}`))
        return
      }

      resolve(result as ParseResult)
    })

    proc.on('error', (err) => {
      reject(new Error(`Falha ao iniciar Python: ${err.message}. Verifique PYTHON_PATH.`))
    })
  })
}
